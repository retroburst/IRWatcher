var express = require('express');
var router = express.Router();

/********************************************************
 * Index route.
 ********************************************************/
router.get('/', function(req, res, next) {
    req.app.locals.context.routerHelpers.buildHomeModel(req, function(err, model){
        if(err ==  null) {
            res.render('index', { title : 'Home', model : model });
        } else {
            req.logger.error(err);
        }
    });
});

/********************************************************
 * List the pull documents route.
 ********************************************************/
router.get('/list-pulls', function(req, res, next){
    var paginationURLPattern = "/list-pulls/?pageNumber=%s&pageSize=%s";
    req.app.locals.context.routerHelpers.buildListPullsModel(req, paginationURLPattern, function(err, model){
        if(err ==  null) {
            res.render('list-pulls', { title : 'List of Pulls from ANZ Bank', model : model });
        } else {
            req.logger.error(err);
        }
    });
});

/********************************************************
 * List the event documents route.
 ********************************************************/
router.get('/list-events', function(req, res, next){
    var paginationURLPattern = "/list-events/?pageNumber=%s&pageSize=%s";
    req.app.locals.context.routerHelpers.buildListEventsModel(req, paginationURLPattern, function(err, model){
        if(err ==  null) {
            res.render('list-events', { title : 'List of Events', model : model });
        } else {
            req.logger.error(err);
        }
    });
});

/********************************************************
 * Show diagnostics route.
 ********************************************************/
router.get('/diagnostics', function(req, res, next){
    req.app.locals.context.routerHelpers.buildDiagnosticsModel(req, function(err, model){
        if(err ==  null) {
            res.render('diagnostics', { title : 'Diagnostics', model : model });
        } else {
            req.logger.error(err);
        }
    });
});

module.exports = router;
