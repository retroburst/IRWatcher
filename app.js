// requires
var config = require('config');
var express = require('express');
var moment = require('moment');
var util = require('util');
var pkg = require('./package.json');

// modules
var routes = require('./routes/index');
var appConstants = require('./modules/app-constants');
var viewHelpers = require('./modules/view-helpers');
var appInitService = require('./modules/app-init-service');
var routerHelpers = require('./modules/router-helpers');
var loggerWrapper = require('log4js-function-designation-wrapper');

// vars
var irWatcherConfig = config.get('irWatcherConfig');
var app = express();
var datastore = null;
var tailLogBuffer = [];
var expressContext = {};
var bankProductJsonService = null;
var logger = null;

// functions
/********************************************************
 * Initializes the local context for the express app.
 ********************************************************/
var initExpressContext = function initExpressContext(){
    // build all the locals for use in routes
    // and views as a context bundle
    expressContext.version = irWatcherConfig.version;
    expressContext.paginationPageSize = irWatcherConfig.paginationPageSize;
    expressContext.moment = moment;
    expressContext.datastore = datastore;
    expressContext.viewHelpers = viewHelpers;
    expressContext.bankProductJsonService = bankProductJsonService;
    expressContext.appConstants = appConstants;
    expressContext.tailLogBuffer = tail();
    expressContext.util = util;
    expressContext.routerHelpers = routerHelpers;
};

/********************************************************
 * Creates a tail object that can tail the log.
 ********************************************************/
var tail = function tail(){
  return(
      {
        getBuffer : function getBuffer() {
            return(tailLogBuffer.slice());
        }
      }
    );
};

/********************************************************
 * Initializes the application.
 ********************************************************/
var initApp = function initApp()
{
    // add the version from package.json to the config
    irWatcherConfig.version = pkg.version;
    // console config and env -> this does not go into the log4js
    // log as it contains secrets and we don't want it appearing
    // diagnostics page
    appInitService.outputConfigToConsole(irWatcherConfig);
    appInitService.outputEnvToConsole(process);
    // init log4js
    appInitService.initLog4js(irWatcherConfig, tailLogBuffer);
    // init local logger
    logger = loggerWrapper(global.logger, 'app');
    // process any command line arguments
    appInitService.processArguments(irWatcherConfig);
    // init the datastore
    datastore = appInitService.initDatastore(irWatcherConfig);
    // init the bank product json service
    bankProductJsonService = appInitService.initBankProductJsonService(irWatcherConfig, datastore);
    // init the express app
    appInitService.initExpress(app, routes, __dirname, irWatcherConfig);
    // add locals for routes and views
    initExpressContext();
    // get the init service to push this context onto the locals object
    appInitService.initExpressLocals(app, expressContext);
};

// initialise the application
initApp();
logger.info(util.format("%s initialised.", appConstants.APP_NAME));

// start listening on specified port
app.listen(irWatcherConfig.bindPort, irWatcherConfig.bindIPAddress, function (err) {
    if (err) {
        logger.error(err);
    } else {
        logger.info(util.format("%s [%s] listening on bound port '%s' for bound IP address '%s'.", appConstants.APP_NAME, irWatcherConfig.version, irWatcherConfig.bindPort, irWatcherConfig.bindIPAddress));
    }
});

module.exports = app;
