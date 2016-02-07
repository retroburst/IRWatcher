// requires
var config = require('config');
var request = require('request');
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var fs = require('fs');
var nedb = require('nedb');
var log4js = require('log4js');
var jsonPath = require('jsonpath-plus');
var moment = require('moment');

// modules
var routes = require('./routes/index');
var users = require('./routes/users');

// vars
var irWatcherConfig = config.get('irWatcherConfig');
var app = express();
var pullsDatastore = null;
var eventsDatastore = null;
var logger = null;

// functions
var processJsonResult = function(body)
{
    logger.debug("Trimming json response from bank.");
    body = body.slice(irWatcherConfig.productJsonLeftTrimLength, body.length - irWatcherConfig.productJsonRightTrimLength);
    // parse the result
    logger.debug("Parsing json response from bank.");
    return(JSON.parse(body));
};

var findRatesOfInterest = function(productData)
{
    var paths = irWatcherConfig.productJsonBaseRatePathsOfInterest;
    var ratesOfInterest = [];
    // pick interesting bits and store in db
    for(var i=0; i < paths.length; i++)
    {
        var path = paths[i];
        logger.debug("Looking for json path [" + path.description + "]: '" + path.jsonPath + "'.");
        var result = jsonPath(path.jsonPath, productData);
        logger.debug("Found " + result.length + " rate(s) for json path [" + path.description + "].");
        // add account type properties to the rate
        for(var j=0; j < result.length; j++) {
            result[j].description = path.description;
            result[j].productCode = path.productCode;
        }
        ratesOfInterest = ratesOfInterest.concat(result);
    }
    return(ratesOfInterest);
};

var insertNewRatesDoc = function(ratesOfInterest)
{
    var ratesOfInterestDoc = {
        date : new Date(),
        numRatesOfInterest : ratesOfInterest.length,
        ratesOfInterest : ratesOfInterest
    };
    pullsDatastore.insert(ratesOfInterestDoc, function (err, doc) {
      if(err === null)
      {
          logger.debug("Inserted new rates of interest doc (" + ratesOfInterest.length + " rates).");
      } else {
          logger.error(err);
      }
    });
};

var compareRates = function(ratesOfInterest)
{
    pullsDatastore.find({}).sort({ date: -1 }).limit(1).exec(function (err, docs) {
     if(err === null)
     {
         // check for changed rates
         var changedRates = [];
         if(docs.length >= 1)
         {
             for(var i=0; i < docs[0].ratesOfInterest.length; i++)
             {
                 for(var j=0; j < ratesOfInterest.length; j++)
                 {
                     if(docs[0].ratesOfInterest[i].code === ratesOfInterest[j].code)
                     {
                         if(docs[0].ratesOfInterest[i].ratevalue !== ratesOfInterest[j].ratevalue)
                         {
                             var rateChange = { oldRateDate: docs[0].date, oldRate : docs[0].ratesOfInterest[i], newRate : ratesOfInterest[j] };
                             logger.debug("Found changed rate! " + rateChange);
                             changedRates.push(rateChange);
                         }
                     }
                 }
             }
         }
         // TODO: if different notify via email
         if(changedRates.length > 0) {
             // do stuff
         }
         
         // stuff them into the datastore
         insertNewRatesDoc(ratesOfInterest);
     } else {
         logger.error(err);
     }
    });
};

var handleRequestRes = function(error, response, body){
    if (!error && response.statusCode == 200) {
        var productData = processJsonResult(body);
        var ratesOfInterest = findRatesOfInterest(productData);
        compareRates(ratesOfInterest);
    } else {
        logger.error(error);
    }
};

var initDatastores = function()
{
    pullsDatastore = new nedb({ filename: irWatcherConfig.pullsDatastore, autoload: true });
    eventsDatastore = new nedb({ filename: irWatcherConfig.eventsDatastore, autoload: true });
};

var initLog4js = function()
{
    log4js.configure(irWatcherConfig.log4js);
    logger = log4js.getLogger('irWatcher');
};

var initApp = function()
{
    // debug logs
    console.log(irWatcherConfig); // console.log this out - don't want it in the logs
    // init log4js
    initLog4js();
    // init the data stores
    initDatastores();

    // TODO: set an interval to check the last pull in the datastore, if a week or more - do a pull down
    // TODO: check for count of docs in db - if none - run pull down immed.
    // pull down the product info json from ANZ bank
    request(irWatcherConfig.targetUri, handleRequestRes);
    
    
};

// initialise the application services
initApp();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(log4js.connectLogger(logger, { level: log4js.levels.INFO }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/bootstrap', express.static(path.join(__dirname, 'node_modules/bootstrap/dist')));
app.use('/jquery', express.static(path.join(__dirname, 'node_modules/jquery/dist')));
app.use('/datatables', express.static(path.join(__dirname, 'node_modules/datatables/media')));

app.use(function(req, res, next){
        req.pullsDatastore = pullsDatastore;
        req.eventsDatastore = eventsDatastore;
        req.config = irWatcherConfig;
        req.logger = logger;
        next();
    });

app.use('/', routes);
app.use('/users', users);

// add locals for jade
app.locals.moment = moment;

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
app.listen(irWatcherConfig.listenPort, function (err) {
           if (err) {
            logger.error(err);
           } else {
            logger.info("IRWatcher listening on port '" + irWatcherConfig.listenPort + "'.");
           }
        });


module.exports = app;
