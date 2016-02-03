// requires
var config = require('config');
var request = require('request');
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var routes = require('./routes/index');
var users = require('./routes/users');

// vars
var irWatcherConfig = config.get('irWatcherConfig');
var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);

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

// debug logs
console.log(irWatcherConfig);
// functions
var handleRequestRes = function(error, response, body){
    if (!error && response.statusCode == 200) {
        // trim the body
        body = body.slice(irWatcherConfig.productJsonLeftTrimLength, body.length - irWatcherConfig.productJsonRightTrimLength);
        // parse the result
        var productData = JSON.parse(body);
        
        // pick interesting bits and store in db
        
        // compare this time to last time
        
        // if different notify via email
        
        console.log(productData);
        
    } else {
        console.log(error);
    }
};

// TODO: set an interval to pull down the json from ANZ once a day

// pull down the product info json from ANZ bank
//request(irWatcherConfig.targetUri, handleRequestRes);

// start listening on config specified port
app.listen(irWatcherConfig.listenPort, function (err) {
           if (err) {
            console.log(err);
           } else {
            console.log("IRWatcher listening on port '" + irWatcherConfig.listenPort + "'.");
           }
        });


module.exports = app;
