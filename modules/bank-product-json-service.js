var request = require('request');
var jsonPath = require('jsonpath-plus');

//TODO: convert terminology to align with concept of a 'pull' from the bank

var _irWatcherConfig = null;
var _logger = null;
var _pullsDatastore = null;
var _eventsDatastore = null;
var _configured = false;

function configure(irWatcherConfig, logger, pullsDatastore, eventsDatastore) {
    _irWatcherConfig = irWatcherConfig;
    _logger = logger;
    _pullsDatastore = pullsDatastore;
    _eventsDatastore = eventsDatastore;
    _configured = true;
}

var processJsonResult = function(body)
{
    _logger.debug("Trimming json response from bank.");
    body = body.slice(_irWatcherConfig.productJsonLeftTrimLength, body.length - _irWatcherConfig.productJsonRightTrimLength);
    // parse the result
    _logger.debug("Parsing json response from bank.");
    return(JSON.parse(body));
};

var findRatesOfInterest = function(productData)
{
    var paths = _irWatcherConfig.productJsonBaseRatePathsOfInterest;
    var ratesOfInterest = [];
    // pick interesting bits and store in db
    for(var i=0; i < paths.length; i++)
    {
        var path = paths[i];
        _logger.debug("Looking for json path [" + path.description + "]: '" + path.jsonPath + "'.");
        var result = jsonPath(path.jsonPath, productData);
        _logger.debug("Found " + result.length + " rate(s) for json path [" + path.description + "].");
        // add account type properties to the rate
        for(var j=0; j < result.length; j++) {
            result[j].description = path.description;
            result[j].productCode = path.productCode;
        }
        ratesOfInterest = ratesOfInterest.concat(result);
    }
    return(ratesOfInterest);
};

var handleInsertNewPullDocEvent = function(err, doc){
    if(err === null)
    {
        _logger.debug("Inserted new pull doc (" + doc.numRatesOfInterest + " rates).");
    } else {
        _logger.error(err);
    }
};

var insertNewPullDoc = function(ratesOfInterest)
{
    var pullDoc = {
        date : new Date(),
        numRatesOfInterest : ratesOfInterest.length,
        ratesOfInterest : ratesOfInterest
    };
    _pullsDatastore.insert(pullDoc, handleInsertNewPullDocEvent);
};

var compareRates = function(ratesOfInterest)
{
    _pullsDatastore.find({}).sort({ date: -1 }).limit(1).exec(function (err, docs) {
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
                                _logger.debug("Found changed rate! " + rateChange);
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
            insertNewPullDoc(ratesOfInterest);
        } else {
            _logger.error(err);
        }
    });
};

var handleRequestRes = function(error, response, body){
    if (!error && response.statusCode == 200) {
        var productData = processJsonResult(body);
        var ratesOfInterest = findRatesOfInterest(productData);
        compareRates(ratesOfInterest);
    } else {
        _logger.error(error);
    }
};

var process = function(){
    if(_configured){
        request(_irWatcherConfig.targetUri, handleRequestRes);
    } else {
        throw new Error("bankProductJsonService has not been configured. Call configure before attempting to call process.");
    }
};

module.exports = {
    configure : configure,
    process : process
};