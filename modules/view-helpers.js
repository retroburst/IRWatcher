var appConstants = require('./app-constants');
var util = require('util');
var moment = require('moment');

var buildTitle = function(title)
{
    if(title){
        return(util.format("%s - %s", title, appConstants.APP_NAME));
    } else {
        return(appConstants.APP_NAME);
    }
};

var formatDate = function(target){
    if(target){
        if(target instanceof moment){
            return(target.format(appConstants.DISPLAY_DATE_FORMAT));
        } else if (target instanceof Date) {
            return(moment(target).format(appConstants.DISPLAY_DATE_FORMAT));
        }
    }
};

var generateClassForLogEntry = function(log){
    if(log){
        if(/ERROR/.test(log)) { return("danger"); }
        else if(/INFO/.test(log)) { return("label label-success"); }
        else if(/DEBUG/.test(log)) { return("default"); }
        else if(/WARN/.test(log)) { return("warning"); }
        else if(/TRACE/.test(log)) { return("default"); }
        else if(/FATAL/.test(log)) { return("danger"); }
        else if(/MARK/.test(log)) { return("default"); }
    }
};

module.exports = {
    buildTitle : buildTitle,
    formatDate : formatDate,
    generateClassForLogEntry : generateClassForLogEntry
};
