// requires
////////////////var appPath = require('app-module-path').addPath(__dirname);
var config = require('config');
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mongodb = require('mongodb');
var monk = require('monk');
var log4js = require('log4js');
var moment = require('moment');
var util = require('util');
var yargs = require('yargs');
var str = require('string');
var memAppender = require('log4js-memory-appender');

// modules
var routes = require('./routes/index');
var bankProductJsonService = require('./modules/bank-product-json-service');
var appConstants = require('./modules/app-constants');
var viewHelpers = require('./modules/view-helpers');

// vars
var irWatcherConfig = config.get('irWatcherConfig');
var app = express();
var datastore = null;
var logger = null;
var tailLogBuffer = [];

// functions
var initDatastore = function()
{
    // build the connection string
    var connectionString = irWatcherConfig.mongodbURL;
    if(irWatcherConfig.mongodbName){
        if(!str(connectionString).endsWith('/')) { connectionString += '/'; }
        connectionString += irWatcherConfig.mongodbName;
    }
    console.log(util.format("Using connection string '%s' for mongodb.", connectionString));
    datastore = monk(connectionString);
    // add functions to help manage collections
    datastore.getPullsCollection = function(){
        return(this.get(irWatcherConfig.mongodbPullsCollectionName));
    };
    datastore.getEventsCollection = function(){
        return(this.get(irWatcherConfig.mongodbEventsCollectionName));
    };
};

var initLog4js = function()
{
    // add the current working directory for support in openshift env
    log4js.configure(irWatcherConfig.log4js, { cwd : irWatcherConfig.logsDir });
    log4js.loadAppender('memory', memAppender({ buffer : tailLogBuffer, maxBufferSize : irWatcherConfig.tailLogBufferSize }));
    log4js.addAppender(log4js.appenders.memory());
    logger = log4js.getLogger(appConstants.APP_NAME);
};

var initBankProductJsonService = function(){
    bankProductJsonService.configure(irWatcherConfig, logger, datastore);
};

var initYargs = function(){
    var argv = yargs
    .usage('Usage: $0 --smtpHost [string] --smtpUser [string] --smtpPassword [string] --notifyAddresses [array]')
    .example('$0 -smtpHost smtp.host.com --smptpUser username --smtpPassword password --notifyAddresses person@host.com anotherperson@host.net')
    .describe({
        'smtpHost' : 'SMTP host for sending notification emails',
        'smtpUser' : 'username for SMTP access',
        'smtpPassword' : 'password for SMTP access',
        'notifyAddresses' : 'array of receipient addressess for notification emails'
        })
    .array('notifyAddresses')
    .string(['smtpHost', 'smtpUser', 'smtpPassword'])
    .demand(['smtpHost', 'smtpUser', 'smtpPassword', 'notifyAddresses'])
    .argv;
    return(argv);
};

var processArguments = function(){
     logger.info(util.format("Using '%s' configuration.", irWatcherConfig.environment));
    // check if deployed locally or not
    if(irWatcherConfig.environment === 'local')
    {
        // proces the arguments using yargs
        var argv = initYargs();
        // add the information from arguments in to the config
        logger.info("Overriding smtp configuration with command line arguments.");
        irWatcherConfig.argumentSmtpHost = argv.smtpHost;
        irWatcherConfig.argumentSmtpUser = argv.smtpUser;
        irWatcherConfig.argumentSmtpPassword = argv.smtpPassword;
        irWatcherConfig.argumentNotifyAddresses = argv.notifyAddresses;
    }
};

var outputConfigToConsole = function(){
    console.log("Configuration ->");
    console.log(irWatcherConfig);
    console.log("Environment ->");
    console.log(process.env);
};

var initApp = function()
{
    // console config and env
    outputConfigToConsole();
    // init log4js
    initLog4js();
    // process any command line arguments
    processArguments();
    // init the datastore
    initDatastore();
    // init the bank product json service
    initBankProductJsonService();
    // do an initial check
    bankProductJsonService.check();
    // set an interval to check the last pull in the datastore, if a week or more - do a pull down
    setInterval(bankProductJsonService.check, irWatcherConfig.intervalHoursBetweenPullRequiredChecks * 3600000);
};

// initialise the application services
initApp();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(log4js.connectLogger(logger, { level: log4js.levels.INFO }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/bootstrap', express.static(path.join(__dirname, 'node_modules/bootstrap/dist')));
app.use('/jquery', express.static(path.join(__dirname, 'node_modules/jquery/dist')));

app.use('/', routes);

// add locals for routes and views
app.locals.moment = moment;
app.locals.datastore = datastore;
app.locals.viewHelpers = viewHelpers;
app.locals.bankProductJsonService = bankProductJsonService;
app.locals.appConstants = appConstants;
app.locals.tailLogBuffer = { getBuffer : function(){ return(tailLogBuffer.slice()); } };

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
        message: err.message,
        error: err
            });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
    message: err.message,
    error: {}
        });
});


// start listening on config specified port
app.listen(irWatcherConfig.bindPort, irWatcherConfig.bindIPAddress, function (err) {
    if (err) {
        logger.error(err);
    } else {
        logger.info(util.format("%s listening on bound port '%s' for bound IP address '%s'.", appConstants.APP_NAME, irWatcherConfig.bindPort, irWatcherConfig.bindIPAddress));
    }
});

module.exports = app;
