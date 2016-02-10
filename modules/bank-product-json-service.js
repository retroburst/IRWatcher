var request = require('request');
var jsonPath = require('jsonpath-plus');
var util = require('util');
var moment = require('moment');

//TODO: convert terminology to align with concept of a 'pull' from the bank

var _irWatcherConfig = null;
var _logger = null;
var _pullsDatastore = null;
var _eventsDatastore = null;
var _configured = false;

/**
 * Configures this instance of the bank product json service.
 */
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

var handleInsertNewEventDocEvent = function(err, doc){
    if(err === null)
    {
        _logger.debug("Inserted new event doc.");
    } else {
        _logger.error(err);
    }
};

var insertNewEventDoc = function(rateChange){
    var eventDoc = {
        date : new Date(),
        oldRate : rateChange.oldRate,
        newRate : rateChange.newRate,
        description : rateChange.description
    };
    _eventsDatastore.insert(eventDoc, handleInsertNewEventDocEvent);
};

var buildRateChangeDescription = function(rateChange){
    return(util.format("Product '%s' with rate code '%s' changed interest rate from %d %s to %d %s.",
        rateChange.oldRate.description,
        rateChange.oldRate.code,
        rateChange.oldRate.ratevalue,
        rateChange.oldRate.ratesuffix,
        rateChange.newRate.ratevalue,
        rateChange.newRate.ratesuffix));
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
                                rateChange.description = buildRateChangeDescription(rateChange);
                                _logger.info(rateChange.description);
                                insertNewEventDoc(rateChange);
                                changedRates.push(rateChange);
                            }
                        }
                    }
                }
            }
            // TODO: if different notify via email
            if(changedRates.length > 0) {
                // email out the info
            }
            
            // stuff them into the datastore
            insertNewPullDoc(ratesOfInterest);
        } else {
            _logger.error(err);
        }
    });
};

//TODO: check on callback patterns - this could be improved
var process = function(callback){
    if(_configured){
        request(_irWatcherConfig.targetUri, function(error, response, body){
            if (!error && response.statusCode == 200) {
                var productData = processJsonResult(body);
                var ratesOfInterest = findRatesOfInterest(productData);
                compareRates(ratesOfInterest);
            } else {
                _logger.error(error);
            }
            if(callback) { callback(); }
        });
    } else {
        throw new Error("bankProductJsonService has not been configured. Call configure before attempting to call process.");
    }
};

var check = function(){
    if(_configured){
        _logger.info("Checking to see if a pull is required from the bank.");
        _pullsDatastore.find({}).sort({ date: -1 }).limit(1).exec(function (err, docs) {
            if(err === null)
            {
                // check when the last pull was - if a x (fomr config) or longer - run it now
                if(docs.length >= 1){
                    var daysDiff = moment(docs[0].date).diff(moment(new Date()));
                    if(daysDiff >= _irWatcherConfig.numberOfDaysBetweenPulls){
                        _logger.info(util.format("Doing a pull from the bank as it has been %d days or more since the last.", _irWatcherConfig.numberOfDaysBetweenPulls));
                        process();
                    } else {
                        _logger.info("No pull required from the bank yet.");
                    }
                }
            } else {
                _logger.error(err);
            }
        });
    } else {
        throw new Error("bankProductJsonService has not been configured. Call configure before attempting to call process.");
    }
};

module.exports = {
    configure : configure,
    check : check,
    process : process
};