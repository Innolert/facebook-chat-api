"use strict";

var cheerio = require("cheerio");
var utils = require("../utils");
var log = require("npmlog");

// [almost] copy pasted from one of FB's minified file (GenderConst)
var GENDERS = {
  0: 'unknown',
  1: 'female_singular',
  2: 'male_singular',
  3: 'female_singular_guess',
  4: 'male_singular_guess',
  5: 'mixed',
  6: 'neuter_singular',
  7: 'unknown_singular',
  8: 'female_plural',
  9: 'male_plural',
  10: 'neuter_plural',
  11: 'unknown_plural',
};

function formatData(obj) {
  return obj;
  // return Object.keys(obj).map(function(key) {
  //   var user = obj[key];
  //   return {
  //     alternateName: user.alternateName,
  //     firstName: user.firstName,
  //     gender: GENDERS[user.gender],
  //     userID: user.id.toString(),
  //     isFriend: (user.is_friend != null && user.is_friend) ? true : false,
  //     fullName: user.name,
  //     profilePicture: user.thumbSrc,
  //     type: user.type,
  //     profileUrl: user.uri,
  //     vanity: user.vanity,
  //     isBirthday: !!user.is_birthday,
  //   }
  // });
}

module.exports = function(defaultFuncs, api, ctx) {
  return function getFriendsRequests(callback) {
    if(!callback) {
      throw {error: "getFriendsRequests: need callback"};
    }

    defaultFuncs
      .postFormData("https://www.facebook.com/ajax/requests/loader", ctx.jar, {}, {viewer: ctx.userID})
      .then(utils.parseAndCheckLogin(ctx.jar, defaultFuncs))
      .then(function(resData) {
        var requestingUsers = [];
        if (!resData) {
          throw {error: "getFriendsRequests returned empty object."};
        }
        if(resData.error) {
          throw resData;
        }
        if (resData.domops && resData.domops[0] && resData.domops[0][3] && resData.domops[0][3].__html) {
          requestingUsers = (function(arr) {
            var u = {}, a = [];
            for(var i = 0, l = arr.length; i < l; ++i){
              if(u.hasOwnProperty(arr[i])) {
                continue;
              }
              a.push(arr[i]);
              u[arr[i]] = 1;
            }
            return a;
          })((resData.domops[0][3].__html.match(/confirm_[0-9]+/g) || []).map(function(alias){ return alias.replace(/confirm_/g, ""); }));
        }
        callback(null, formatData(requestingUsers));
      })
      .catch(function(err) {
        log.error("Error in getFriendsRequests", err);
        return callback(err);
      });
  };
};