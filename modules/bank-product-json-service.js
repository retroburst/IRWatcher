// requires
var jade = require('jade');
var request = require('request');
var jsonPath = require('jsonpath-plus');
var util = require('util');
var moment = require('moment');
var email = require('emailjs');
var schedule = require('node-schedule');
var loggerWrapper = require('log4js-function-designation-wrapper');

// modules
var appConstants = require('./app-constants');

// variables
var irWatcherConfig = null;
var logger = null;
var datastore = null;
var emailTemplate = null;
var pullJob = null;

/********************************************************
 * Configures the bank product JSON service.
 ********************************************************/
var configure = function configure(_irWatcherConfig, _datastore) {
    irWatcherConfig = _irWatcherConfig;
    datastore = _datastore;
    logger = loggerWrapper(global.logger, 'bank-product-json-service');
    emailTemplate = jade.compileFile(appConstants.EMAIL_TEMPLATE_PATH, { pretty : true });
    pullJob = scheduleJob();
}

/********************************************************
 * Schedules the pull job based on config.
 ********************************************************/
var scheduleJob = function scheduleJob(){
    var scheduleLocalToServer = null;
    var scheduleTime = new Date();
    scheduleTime.setUTCHours(irWatcherConfig.bankProductJsonService.jobSchedule.hour);
    scheduleTime.setUTCMinutes(irWatcherConfig.bankProductJsonService.jobSchedule.minute);
    scheduleLocalToServer = { hour: scheduleTime.getHours(), minute: scheduleTime.getMinutes(), dayOfWeek: irWatcherConfig.bankProductJsonService.jobSchedule.dayOfWeek };
    logger.info("Scheduling Bank Product JSON Service to run according to configuration converted to local time.",
        scheduleLocalToServer, "local timezone offset", scheduleTime.getTimezoneOffset());
    console.log(process);
    var job = schedule.scheduleJob(scheduleLocalToServer, process);
    return(job);
};

/********************************************************
 * Processes the json result by trimming off the unwanted
 * sections.
 ********************************************************/
var processJsonResult = function processJsonResult(body)
{
    logger.info("Trimming json response from bank.");
    body = body.slice(irWatcherConfig.productJsonLeftTrimLength, body.length - irWatcherConfig.productJsonRightTrimLength);
    // parse the result
    _logger.info("Parsing json response from bank.");
    return(JSON.parse(body));
};

/********************************************************
 * Finds the rates of interest in the json.
 ********************************************************/
var findRatesOfInterest = function findRatesOfInterest(productData)
{
    var paths = irWatcherConfig.productJsonBaseRatePathsOfInterest;
    var ratesOfInterest = [];
    // pick interesting bits and store in db
    for(var i=0; i < paths.length; i++)
    {
        var path = paths[i];
        logger.info("Looking for json path [" + path.description + "]: '" + path.jsonPath + "'.");
        var result = jsonPath(path.jsonPath, productData);
        logger.info("Found " + result.length + " rate(s) for json path [" + path.description + "].");
        // add account type properties to the rate
        for(var j=0; j < result.length; j++) {
            result[j].description = path.description;
            result[j].productCode = path.productCode;
        }
        ratesOfInterest = ratesOfInterest.concat(result);
    }
    return(ratesOfInterest);
};

/********************************************************
 * Handles the insert result of a new pull document.
 ********************************************************/
var handleInsertNewPullDocEvent = function handleInsertNewPullDocEvent(err, doc){
    if(err)
    {
        logger.error(err);
    } else {
        logger.info("Inserted new pull doc (" + doc.numRatesOfInterest + " rates).");
    }
};

/********************************************************
 * Inserts a new pull document.
 ********************************************************/
var insertNewPullDoc = function insertNewPullDoc(ratesOfInterest)
{
    var pullDoc = {
        date : new Date(),
        numRatesOfInterest : ratesOfInterest.length,
        ratesOfInterest : ratesOfInterest
    };
    datastore.getPullsCollection().insert(pullDoc, handleInsertNewPullDocEvent);
};

/********************************************************
 * Handles the insert result of a new event document.
 ********************************************************/
var handleInsertNewEventDocEvent = function handleInsertNewEventDocEvent(err, doc){
    if(err)
    {
        logger.error(err);
    } else {
        logger.info("Inserted new event doc.");
    }
};

/********************************************************
 * Inserts a new event document.
 ********************************************************/
var insertNewEventDoc = function insertNewEventDoc(rateChange){
    var eventDoc = {
        date : new Date(),
        oldRate : rateChange.oldRate,
        newRate : rateChange.newRate,
        description : rateChange.description
    };
    datastore.getEventsCollection().insert(eventDoc, handleInsertNewEventDocEvent);
};

/********************************************************
 * Builds a description of the rate change found.
 ********************************************************/
var buildRateChangeDescription = function buildRateChangeDescription(rateChange){
    return(util.format("Product '%s' with rate code '%s' changed interest rate from %d %s to %d%s",
        rateChange.oldRate.description,
        rateChange.oldRate.code,
        rateChange.oldRate.ratevalue,
        rateChange.oldRate.ratesuffix,
        rateChange.newRate.ratevalue,
        rateChange.newRate.ratesuffix));
};

/********************************************************
 * Handles the notification mail sent event.
 ********************************************************/
var handleNotificationMailEvent = function handleNotificationMailEvent(err, message){
    if(err){
        logger.error(err);
    } else {
        logger.info("Email notifications sent successfully.");
    }
};

/********************************************************
 * Builds a plain text notification email.
 ********************************************************/
var buildPlainTextChangedRatesMessage = function buildPlainTextChangedRatesMessage(changedRates){
    var rateChangesMessage = 'Notification\n\nChanges in rates of interest at ANZ bank have been detected.\n\n';
    for(var i=0; i < changedRates.length; i++)
    {
        rateChangesMessage += ' • ' + changedRates[i].description + '\n';
    }
    return(rateChangesMessage);
};

/********************************************************
 * Builds the SMTP configuration based conditionally on
 * the environment in use (local or OpenShift).
 ********************************************************/
var buildSmtpConfig = function buildSmtpConfig(){
    var config = null;
    if(irWatcherConfig.environment == appConstants.ENVIRONMENT_LOCAL_NAME){
        config =
        {
            user : irWatcherConfig.argumentSmtpUser,
            password : irWatcherConfig.argumentSmtpPassword,
            host : irWatcherConfig.argumentSmtpHost,
            ssl : true,
            notifyAddresses : irWatcherConfig.argumentNotifyAddresses
        };
    } else {
        config =
        {
            user : irWatcherConfig.smtpUser,
            password : irWatcherConfig.smtpPassword,
            host : irWatcherConfig.smtpHost,
            ssl : true,
            notifyAddresses : irWatcherConfig.notifyAddresses
        };
    }
    return(config);
};

/********************************************************
 * Sends email notifications for rate changes.
 ********************************************************/
var sendEmailNotifications = function sendEmailNotifications(changedRates){
    logger.info("Sending email notifications to notify addresses.");
    try{
        var config = buildSmtpConfig();
        var server = email.server.connect(config);
        var rateChangesMessage = buildPlainTextChangedRatesMessage(changedRates);
        var messageHTML = _emailTemplate({ model : { appName : appConstants.APP_NAME, selfURL : irWatcherConfig.selfURL, changedRates : changedRates } });
        var message	= {
            text: rateChangesMessage,
            from: appConstants.APP_NAME + " <" + config.user + ">",
            to: config.notifyAddresses,
            subject: appConstants.APP_NAME + ": Rates of Interest Change(s) @ " + moment().format(appConstants.DISPLAY_DATE_FORMAT),
            attachment: [{ data: messageHTML, alternative: true }]
        };
        server.send(message, handleNotificationMailEvent);
    } catch(err) {
        logger.error("Failed to send email notifications.", err);
    }
};

/********************************************************
 * Test email send.
 ********************************************************/
var testEmailSend = function testEmailSend(){
    logger.info("Sending test email to notify addresses.");
    try{
        var config = buildSmtpConfig();
        var server = email.server.connect(config);
        var message	= {
            text: "Test from IRWatcher application.",
            from: appConstants.APP_NAME + " <" + config.user + ">",
            to: config.notifyAddresses,
            subject: appConstants.APP_NAME + ": Test @ " + moment().format(appConstants.DISPLAY_DATE_FORMAT)
        };
        server.send(message, function (err, message){
            if(err){
                logger.error(err);
            } else {
                logger.info("Email test sent successfully.", message);
            }
        });
    } catch(err) {
        logger.error("Failed to send test email.", err);
    }
};

/********************************************************
 * Compares the rates in the current pull with the last pull.
 ********************************************************/
var compareRates = function compareRates(ratesOfInterest)
{
    datastore.getPullsCollection().find({}, { limit : 1, sort : { date: -1 } }, function (err, pulls) {
        if(err)
        {
            logger.error(err);
        } else {
            // check for changed rates
            var changedRates = [];
            if(pulls.length >= 1)
            {
                for(var i=0; i < pulls[0].ratesOfInterest.length; i++)
                {
                    for(var j=0; j < ratesOfInterest.length; j++)
                    {
                        if(pulls[0].ratesOfInterest[i].code === ratesOfInterest[j].code)
                        {
                            if(pulls[0].ratesOfInterest[i].ratevalue !== ratesOfInterest[j].ratevalue)
                            {
                                var rateChange = { oldRateDate: pulls[0].date, oldRate : pulls[0].ratesOfInterest[i], newRate : ratesOfInterest[j] };
                                rateChange.description = buildRateChangeDescription(rateChange);
                                logger.info(rateChange.description);
                                insertNewEventDoc(rateChange);
                                changedRates.push(rateChange);
                            }
                        }
                    }
                }
            }
            // if differences - notify via email
            if(changedRates.length > 0) {
                sendEmailNotifications(changedRates);
            }
            // stuff them into the datastore
            insertNewPullDoc(ratesOfInterest);
        }
    });
};

/********************************************************
 * Requests the bank product JSON and processes it.
 ********************************************************/
var process = function process(callback){
    request(irWatcherConfig.bankProductJsonService.productJsonURL, function(error, response, body){
        if (!error && response.statusCode == 200) {
            var productData = processJsonResult(body);
            var ratesOfInterest = findRatesOfInterest(productData);
            compareRates(ratesOfInterest);
        } else {
            logger.error(error);
        }
        if(callback) { callback(); }
    });
};

/********************************************************
 * Returns when the service is set to next run.
 ********************************************************/
var getScheduledRunInfo = function getScheduledRunInfo(){
    return({ next: pullJob.nextInvocation() });
};

module.exports = {
    configure : configure,
    getScheduledRunInfo : getScheduledRunInfo,
    testEmailSend : testEmailSend
};