// requires
var jade = require('jade');
var request = require('request');
var jsonPath = require('jsonpath-plus');
var util = require('util');
var moment = require('moment');
var email = require('emailjs');
var appConstants = require('./app-constants');

// vars
var _irWatcherConfig = null;
var _logger = null;
var _datastore = null;
var _configured = false;
var _emailTemplate = null;
var _lastCheckDate = null;
var _lastPullDate = null;
var _nextCheckDate = null;
var _nextPullDate = null;

/**
 * Configures this instance of the bank product json service.
 */
function configure(irWatcherConfig, logger, datastore) {
    _irWatcherConfig = irWatcherConfig;
    _logger = logger;
    _datastore = datastore;
    _emailTemplate = jade.compileFile("./templates/notify-email.jade", { pretty : true });
    _configured = true;
}

var processJsonResult = function(body)
{
    _logger.info("Trimming json response from bank.");
    body = body.slice(_irWatcherConfig.productJsonLeftTrimLength, body.length - _irWatcherConfig.productJsonRightTrimLength);
    // parse the result
    _logger.info("Parsing json response from bank.");
    return(JSON.parse(body));
};

var findRatesOfInterest = function(productData)
{
    var paths = _irWatcherConfig.productJsonBaseRatePathsOfInterest;
    var ratesOfInterest = [];
    // pick interesting bits and store in db
    for(var i=0; i < paths.length; i++)
    {
        var path = paths[i];
        _logger.info("Looking for json path [" + path.description + "]: '" + path.jsonPath + "'.");
        var result = jsonPath(path.jsonPath, productData);
        _logger.info("Found " + result.length + " rate(s) for json path [" + path.description + "].");
        // add account type properties to the rate
        for(var j=0; j < result.length; j++) {
            result[j].description = path.description;
            result[j].productCode = path.productCode;
        }
        ratesOfInterest = ratesOfInterest.concat(result);
    }
    return(ratesOfInterest);
};

var handleInsertNewPullDocEvent = function(err, doc){
    if(err === null)
    {
        _logger.info("Inserted new pull doc (" + doc.numRatesOfInterest + " rates).");
    } else {
        _logger.error(err);
    }
};

var insertNewPullDoc = function(ratesOfInterest)
{
    var pullDoc = {
        date : new Date(),
        numRatesOfInterest : ratesOfInterest.length,
        ratesOfInterest : ratesOfInterest
    };
    _datastore.getPullsCollection().insert(pullDoc, handleInsertNewPullDocEvent);
};

var handleInsertNewEventDocEvent = function(err, doc){
    if(err === null)
    {
        _logger.info("Inserted new event doc.");
    } else {
        _logger.error(err);
    }
};

var insertNewEventDoc = function(rateChange){
    var eventDoc = {
        date : new Date(),
        oldRate : rateChange.oldRate,
        newRate : rateChange.newRate,
        description : rateChange.description
    };
    _eventsDatastore.getEventsCollection().insert(eventDoc, handleInsertNewEventDocEvent);
};

var buildRateChangeDescription = function(rateChange){
    return(util.format("Product '%s' with rate code '%s' changed interest rate from %d %s to %d%s",
        rateChange.oldRate.description,
        rateChange.oldRate.code,
        rateChange.oldRate.ratevalue,
        rateChange.oldRate.ratesuffix,
        rateChange.newRate.ratevalue,
        rateChange.newRate.ratesuffix));
};

var handleNotificationMailEvent = function(err, message){
    if(err){
        _logger.error(err);
    } else {
        _logger.info("Email notifications sent successfully.");
    }
};

var buildPlainTextChangedRatesMessage = function(changedRates){
    var rateChangesMessage = 'Notification\n\nChanges in rates of interest at ANZ bank have been detected.\n\n';
    for(var i=0; i < changedRates.length; i++)
    {
        rateChangesMessage += ' • ' + changedRates[i].description + '\n';
    }
    return(rateChangesMessage);
};

var buildSmtpConfig = function(){
    var config = null;
    if(_irWatcherConfig.environment === 'local'){
        config =
        {
            user : _irWatcherConfig.argumentSmtpUser,
            password : _irWatcherConfig.argumentSmtpPassword,
            host : _irWatcherConfig.argumentSmtpHost,
            ssl : true,
            notifyAddresses : _irWatcherConfig.argumentNotifyAddresses
        };
    } else {
        config =
        {
            user : _irWatcherConfig.smtpUser,
            password : _irWatcherConfig.smtpPassword,
            host : _irWatcherConfig.smtpHost,
            ssl : true,
            notifyAddresses : _irWatcherConfig.notifyAddresses
        };
    }
    return(config);
};

var sendEmailNotifications = function(changedRates){
    _logger.info("Sending email notifications to notify addresses.");
    
    irWatcherConfig.argumentSmtpHost = argv.smtpHost;
    irWatcherConfig.argumentSmtpUser = argv.smtpUser;
    irWatcherConfig.argumentSmtpPassword = argv.smtpPassword;
    irWatcherConfig.argumentNotifyAddresses = argv.notifyAddresses;
    
    var config = buildSmtpConfig();
    var server 	= email.server.connect(config);
    var rateChangesMessage = buildPlainTextChangedRatesMessage(changedRates);
    var messageHTML = _emailTemplate({ model : { appName : appConstants.APP_NAME, selfURL : _irWatcherConfig.selfURL, changedRates : changedRates } });
    var message	=
    {
    text: rateChangesMessage,
    from: appConstants.APP_NAME + " <" + _irWatcherConfig.smtpUser + ">",
    to: config.notifyAddresses,
    subject: appConstants.APP_NAME + ": Rates of Interest Change(s) @ " + moment().format(appConstants.DISPLAY_DATE_FORMAT),
    attachment:
        [
            { data: messageHTML, alternative: true }
        ]
    };
    server.send(message, handleNotificationMailEvent);
};


var compareRates = function(ratesOfInterest)
{
    _datastore.getPullsCollection().find({}, { limit : 1, sort : { date: -1 } }, function (err, pulls) {
        if(err === null)
        {
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
                                _logger.info(rateChange.description);
                                insertNewEventDoc(rateChange);
                                changedRates.push(rateChange);
                            }
                        }
                    }
                }
            }
            // if differences - notify via email
            if(changedRates.length > 0) { sendEmailNotifications(changedRates); }
            // stuff them into the datastore
            insertNewPullDoc(ratesOfInterest);
        } else {
            _logger.error(err);
        }
    });
};

//TODO: check on callback patterns - this could be improved
var process = function(callback){
    if(_configured){
        request(_irWatcherConfig.productJsonURL, function(error, response, body){
            if (!error && response.statusCode == 200) {
                var productData = processJsonResult(body);
                var ratesOfInterest = findRatesOfInterest(productData);
                compareRates(ratesOfInterest);
            } else {
                _logger.error(error);
            }
            if(callback) { callback(); }
        });
    } else {
        throw new Error("bankProductJsonService has not been configured. Call configure before attempting to call process.");
    }
};

var calculateTimepoints = function(){
    if(_lastPullDate){ _nextPullDate = _lastPullDate.add(_irWatcherConfig.numberOfHoursBetweenPulls, 'h'); }
    if(_lastCheckDate){ _nextCheckDate = _lastCheckDate.add(_irWatcherConfig.intervalHoursBetweenPullRequiredChecks, 'h'); }
    return({
        lastCheckDate : _lastCheckDate,
        nextCheckDate : _nextCheckDate,
        lastPullDate : _lastPullDate,
        nextPullDate : _nextPullDate
        });
};

var calculateDurationInHours = function(first, second){
    var duration = moment.duration(moment(first).diff(moment(second)));
    return(duration.asHours());
};

var check = function(){
    if(_configured){
        _lastCheckDate = moment();
        _logger.info("Checking to see if a pull is required from the bank.");
        _datastore.getPullsCollection().find({}, { limit : 1, sort : { date : -1} }, function (err, pulls) {
            if(err === null)
            {
                // check when the last pull was - if a x (from config) or longer - run it now
                if(pulls.length >= 1){
                    _lastPullDate = moment(pulls[0].date);
                    var durationInHours = calculateDurationInHours(new Date(), pulls[0].date);
                    _logger.info(util.format("Difference in hours from last pull to now was %d.", durationInHours));
                    if(durationInHours >= _irWatcherConfig.numberOfHoursBetweenPulls){
                        _logger.info(util.format("Doing a pull from the bank as it has been %d hours or more since the last.", _irWatcherConfig.numberOfHoursBetweenPulls));
                        process();
                    } else {
                        _logger.info("No pull required from the bank yet.");
                    }
                } else if (pulls.length == 0) {
                    _logger.info("Doing an initial pull from the bank as none in the datastore.");
                    _lastPullDate = moment();
                    process();
                }
            } else {
                _logger.error(err);
            }
        });
    } else {
        throw new Error("bankProductJsonService has not been configured. Call configure before attempting to call process.");
    }
};

module.exports = {
    configure : configure,
    check : check,
    process : process,
    calculateTimepoints : calculateTimepoints
};