// requires
var config = require('config');
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var nedb = require('nedb');
var log4js = require('log4js');
var moment = require('moment');
var util = require('util');
var yargs = require('yargs');

// modules
var routes = require('./routes/index');
var users = require('./routes/users');
var bankProductJsonService = require('./modules/bank-product-json-service');
var appConstants = require('./modules/app-constants');
var viewHelpers = require('./modules/view-helpers');

// vars
var irWatcherConfig = config.get('irWatcherConfig');
var app = express();
var pullsDatastore = null;
var eventsDatastore = null;
var logger = null;

// functions
var initDatastores = function()
{
    pullsDatastore = new nedb({ filename: irWatcherConfig.pullsDatastore, autoload: true });
    eventsDatastore = new nedb({ filename: irWatcherConfig.eventsDatastore, autoload: true });
};

var initLog4js = function()
{
    log4js.configure(irWatcherConfig.log4js);
    logger = log4js.getLogger(appConstants.APP_NAME);
};

var initBankProductJsonService = function(){
    bankProductJsonService.configure(irWatcherConfig, logger, pullsDatastore, eventsDatastore);
};

var processArguments = function(){
    // check if deployed on heroku
    if(process.env.deploy === 'heroku')
    {
        logger.info("Using heroku configuration");
        irWatcherConfig.smtpHost = process.env.smtpHost;
        irWatcherConfig.smtpUser = process.env.smtpUser;
        irWatcherConfig.smtpPassword = process.env.smtpPassword;
        irWatcherConfig.notifyAddresses = process.env.notifyAddresses.split(',');
        // assign the listening port for heroku environment
        logger.info("Using heroku assigned port: " + process.env.PORT);
        irWatcherConfig.herokuListenPort = process.env.PORT;
    } else {
        // proces the arguments using yargs
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
        
        // add the information from arguments in to the config
        irWatcherConfig.smtpHost = argv.smtpHost;
        irWatcherConfig.smtpUser = argv.smtpUser;
        irWatcherConfig.smtpPassword = argv.smtpPassword;
        irWatcherConfig.notifyAddresses = argv.notifyAddresses;
    }
};

var initApp = function()
{
    // init log4js
    initLog4js();
    // process any command line arguments
    processArguments();
    // init the data stores
    initDatastores();
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
app.use('/users', users);

// add locals for routes and views
app.locals.moment = moment;
app.locals.pullsDatastore = pullsDatastore;
app.locals.eventsDatastore = eventsDatastore;
app.locals.viewHelpers = viewHelpers;
app.locals.bankProductJsonService = bankProductJsonService;
app.locals.appConstants = appConstants;

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
app.listen((irWatcherConfig.herokuListenPort || irWatcherConfig.listenPort), function (err) {
    if (err) {
        logger.error(err);
    } else {
        logger.info(util.format("%s listening on port '%d'.", appConstants.APP_NAME, (irWatcherConfig.herokuListenPort || irWatcherConfig.listenPort)));
    }
});


module.exports = app;
