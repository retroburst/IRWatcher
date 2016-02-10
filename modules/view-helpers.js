var appConstants = require('./app-constants');
var util = require('util');

var buildTitle = function(title)
{
    if(title){
        return(util.format("%s - %s", title, appConstants.APP_NAME));
    } else {
        return(appConstants.APP_NAME);
    }
};

module.exports = {
    buildTitle : buildTitle
};
