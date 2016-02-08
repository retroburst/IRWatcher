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
            res.render('list-pulls', { model : { pulls : docs } } );
        } else {
            req.logger.error(err);
        }
    });
    
});

// ideas for other routes
//-- report
//-- log
//

module.exports = router;
