var express = require('express');
var router = express.Router();
var fs = require('fs');

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

router.get('/diagnostics', function(req, res, next){
    var timepoints = req.app.locals.context.bankProductJsonService.calculateTimepoints();
    var tailLogBuffer = req.app.locals.context.tailLogBuffer.getBuffer();
    res.render('diagnostics', { title : 'Diagnostics', model : { timepoints : timepoints, tailLogBuffer : tailLogBuffer } } );
});

/*
 router.get('/force-pull', function(req, res, next){
 var svc = req.app.locals.bankProductJsonService;
 svc.process(function(){
 res.redirect('/list-pulls');
 });
 });
 */

module.exports = router;
