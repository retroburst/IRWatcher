var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'IRWatcher' });
});

// ideas for other routes
//-- report
//-- log
//

module.exports = router;
