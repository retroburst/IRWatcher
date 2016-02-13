var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
    var pullsds = req.app.locals.pullsDatastore;
    pullsds.find({}).sort({ date: -1 }).limit(1).exec(function (err, pulls) {
        if(err === null)
        {
            var eventsds = req.app.locals.eventsDatastore;
            eventsds.find({}).sort({ date: -1 }).limit(5).exec(function (err, events) {
                if(err === null){
                    res.render('index', { title: req.app.locals.appConstants.APP_NAME, model : { pulls : pulls, events : events } });
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
    var ds = req.app.locals.pullsDatastore;
    ds.find({}).sort({ date: -1 }).exec(function (err, docs) {
        if(err === null){
            res.render('list-pulls', { title : 'List of Pulls from ANZ Bank', model : { pulls : docs } } );
        } else {
            req.logger.error(err);
        }
    });
});

router.get('/list-events', function(req, res, next){
    var ds = req.app.locals.eventsDatastore;
    ds.find({}).sort({ date: -1 }).exec(function (err, docs) {
        if(err === null){
            res.render('list-events', { title : 'List of Events', model : { events : docs } } );
        } else {
            req.logger.error(err);
        }
    });
});

router.get('/force-pull', function(req, res, next){
    var svc = req.app.locals.bankProductJsonService;
    svc.process(function(){
        res.redirect('/list-pulls');
    });
});

module.exports = router;
