var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { title: 'IRWatcher' });
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

router.get('/force-pull', function(req, res, next){
    var svc = req.app.locals.bankProductJsonService;
    svc.process(function(){
        res.redirect('/list-pulls');
    });
});

// ideas for other routes
//-- report
//-- log
//

module.exports = router;
