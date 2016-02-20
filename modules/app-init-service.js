// requires
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var favicon = require('serve-favicon');
var morgan = require('morgan');
var mongodb = require('mongodb');
var monk = require('monk');
var log4js = require('log4js');
var memAppender = require('log4js-memory-appender');
var yargs = require('yargs');
var util = require('util');
var str = require('string');

// modules
var appConstants = require('./app-constants');

// functions
var initDatastore = function(irWatcherConfig, logger)
{
    var datastore = null;
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
    return(datastore);
};

var initLog4js = function(irWatcherConfig, buffer)
{
    var logger = null;
    // add the current working directory for support in openshift env
    log4js.configure(irWatcherConfig.log4js, { cwd : irWatcherConfig.logsDir });
    log4js.loadAppender('memory', memAppender({ buffer : buffer, maxBufferSize : irWatcherConfig.tailLogBufferSize }));
    log4js.addAppender(log4js.appenders.memory());
    logger = log4js.getLogger(appConstants.APP_NAME);
    return(logger);
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

var processArguments = function(irWatcherConfig, logger){
    logger.info(util.format("Using '%s' configuration.", irWatcherConfig.environment));
    // check if deployed locally or not
    if(irWatcherConfig.environment === appConstants.ENVIRONMENT_LOCAL_NAME)
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

var outputConfigToConsole = function(irWatcherConfig, process){
    console.log("Configuration ->");
    console.log(irWatcherConfig);
};

var outputEnvToConsole = function(process){
    console.log("Environment ->");
    console.log(process.env);
};

var initExpress = function(app, routes, __dirname){
    // view engine setup
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'jade');
    app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
    // only want this node.js/express logging to go to console
    //app.use(log4js.connectLogger(log4jsConsoleOnly.getLogger(appConstants.APP_NAME), { level: log4js.levels.INFO }));
    app.use(morgan('combined'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/bootstrap', express.static(path.join(__dirname, 'node_modules/bootstrap/dist')));
    app.use('/jquery', express.static(path.join(__dirname, 'node_modules/jquery/dist')));
    
    app.use('/', routes);
    
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
};

var initExpressLocals = function(app, locals){
    app.locals.context = locals;
};

module.exports = {
    initDatastore : initDatastore,
    initLog4js : initLog4js,
    processArguments : processArguments,
    outputConfigToConsole : outputConfigToConsole,
    outputEnvToConsole : outputEnvToConsole,
    initExpress : initExpress,
    initExpressLocals : initExpressLocals
};