var express = require('express');
var router = express.Router();

/********************************************************
 * Index route.
 ********************************************************/
router.get('/', function(req, res, next) {
    var pullsCollection = req.app.locals.context.datastore.getPullsCollection();
    pullsCollection.find({}, { limit : 1, sort : { date : -1 } }, function (err, pulls) {
        if(err === null)
        {
            var eventsCollection = req.app.locals.context.datastore.getEventsCollection();
            eventsCollection.find({}, { limit : 5, sort : { date : -1 } }, function (err, events) {
                if(err === null){
                    res.render('index', { title: 'Home', model : { pulls : pulls, events : events }});
                } else {
                    req.logger.error(err);
                }
            });
        } else {
            req.logger.error(err);
        }
    });
});

/********************************************************
 * List the pull documents route.
 ********************************************************/
router.get('/list-pulls', function(req, res, next){
    var pullsCollection = req.app.locals.context.datastore.getPullsCollection();
    pullsCollection.find({}, { sort : { date : -1 } }, function (err, pulls) {
        if(err === null){
            res.render('list-pulls', { title : 'List of Pulls from ANZ Bank', model : { pulls : pulls } } );
        } else {
            req.logger.error(err);
        }
    });
});

/********************************************************
 * List the event documents route.
 ********************************************************/
router.get('/list-events', function(req, res, next){
    var eventsCollection = req.app.locals.context.datastore.getEventsCollection();
    eventsCollection.find({}, { sort : { date : -1 } }, function (err, events) {
        if(err === null){
            res.render('list-events', { title : 'List of Events', model : { events : events } } );
        } else {
            req.logger.error(err);
        }
    });
});

/********************************************************
 * Show diagnostics route.
 ********************************************************/
router.get('/diagnostics', function(req, res, next){
    var timepoints = req.app.locals.context.bankProductJsonService.calculateTimepoints();
    var tailLogBuffer = req.app.locals.context.tailLogBuffer.getBuffer();
    res.render('diagnostics', { title : 'Diagnostics', model : { timepoints : timepoints, tailLogBuffer : tailLogBuffer } } );
});

module.exports = router;
