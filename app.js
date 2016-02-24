// requires
var config = require('config');
var express = require('express');
var moment = require('moment');
var util = require('util');
var pkg = require('./package.json');

// modules
var routes = require('./routes/index');
var bankProductJsonService = require('./modules/bank-product-json-service');
var appConstants = require('./modules/app-constants');
var viewHelpers = require('./modules/view-helpers');
var appInitService = require('./modules/app-init-service');

// vars
var irWatcherConfig = config.get('irWatcherConfig');
var app = express();
var datastore = null;
var logger = null;
var tailLogBuffer = [];
var expressContext = {};

// functions
/********************************************************
 * Initializes the local context for the express app.
 ********************************************************/
var initExpressContext = function(){
    // build all the locals for use in routes
    // and views as a context bundle
    expressContext.version = irWatcherConfig.version;
    expressContext.moment = moment;
    expressContext.datastore = datastore;
    expressContext.viewHelpers = viewHelpers;
    expressContext.bankProductJsonService = bankProductJsonService;
    expressContext.appConstants = appConstants;
    expressContext.tailLogBuffer = { getBuffer : function(){ return(tailLogBuffer.slice()); } };
};

/********************************************************
 * Initializes the application.
 ********************************************************/
var initApp = function()
{
    // add the version from package.json to the config
    irWatcherConfig.version = pkg.version;
    // console config and env -> this does not go into the log4js
    // log as it contains secrets and we don't want it appearing
    // diagnostics page
    appInitService.outputConfigToConsole(irWatcherConfig);
    appInitService.outputEnvToConsole(process);
    // init log4js
    logger = appInitService.initLog4js(irWatcherConfig, tailLogBuffer);
    // process any command line arguments
    appInitService.processArguments(irWatcherConfig, logger);
    // init the datastore
    datastore = appInitService.initDatastore(irWatcherConfig, logger);
    // init the bank product json service
    bankProductJsonService.configure(irWatcherConfig, logger, datastore);
    // do an initial check
    bankProductJsonService.check();
    // set an interval to check the last pull in the datastore, if a week or more - do a pull down
    setInterval(bankProductJsonService.check, irWatcherConfig.intervalHoursBetweenPullRequiredChecks * 3600000);
    // init the express app
    appInitService.initExpress(app, routes, __dirname);
    // add locals for routes and views
    initExpressContext();
    // get the init service to push this context onto the locals object
    appInitService.initExpressLocals(app, expressContext);
};

// initialise the application
initApp();

// start listening on specified port
app.listen(irWatcherConfig.bindPort, irWatcherConfig.bindIPAddress, function (err) {
    if (err) {
        logger.error(err);
    } else {
        logger.info(util.format("%s [%s] listening on bound port '%s' for bound IP address '%s'.", appConstants.APP_NAME, irWatcherConfig.version, irWatcherConfig.bindPort, irWatcherConfig.bindIPAddress));
    }
});

module.exports = app;
