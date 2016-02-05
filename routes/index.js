var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'IRWatcher' });
});

router.get('/list', function(req, res, next){
    var ds = req.ds;
    ds.find({}).sort({ date: -1 }).exec(function (err, docs) {
                                                   if(err === null){
                                                    res.render('list', { model : { ratesOfInterestDocs : docs } } );
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
