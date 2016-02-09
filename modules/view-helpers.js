var _appConstants = require('./app-constants');
var _util = require('util');

var buildTitle = function(title)
{
    console.log(_appConstants);
    if(title){
        return(_util.format("%s - %s", title, _appConstants.APP_NAME));
    } else {
        return(constants.APP_NAME);
    }
};

module.exports = {
    buildTitle : buildTitle
};
