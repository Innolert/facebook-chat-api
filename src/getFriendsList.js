"use strict";

var cheerio = require("cheerio");
var utils = require("../utils");
var log = require("npmlog");
var q = require('q');

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
  return Object.keys(obj).map(function(key) {
    var user = obj[key];
    return {
      alternateName: user.alternateName,
      firstName: user.firstName,
      gender: GENDERS[user.gender],
      userID: user.id.toString(),
      isFriend: (user.is_friend != null && user.is_friend) ? true : false,
      fullName: user.name,
      profilePicture: user.thumbSrc,
      type: user.type,
      profileUrl: user.uri,
      vanity: user.vanity,
      isBirthday: !!user.is_birthday,
    }
  });
}

module.exports = function(defaultFuncs, api, ctx) {
  return function getFriendsList(callback, options) {
    if(!callback) {
      throw {error: "getFriendsList: need callback"};
    }

    defaultFuncs
      .postFormData("https://www.facebook.com/chat/user_info_all", ctx.jar, {}, {viewer: ctx.userID})
      .then(utils.parseAndCheckLogin(ctx.jar, defaultFuncs))
      .then(function(resData) {
        if (!resData) {
          throw {error: "getFriendsList returned empty object."};
        }
        if(resData.error) {
          throw resData;
        }

        if (options && options.getMutualFriends) {
          var promisesArray = [],
            ids = Object.keys(resData.payload).map(function(key) { return resData.payload[key].id.toString(); }),
            i = ids.length;

          while(i--) {
            var id = ids[i],
              deferred = q.defer();

            promisesArray.push(deferred.promise);

            (function(id, deferred) {
              defaultFuncs
                .get("https://www.facebook.com/ajax/pagelet/generic.php/FriendsAppCollectionPagelet", ctx.jar, { "data": { "collection_token": id + ":2356318349:3", "profile_id": parseInt(id) } }, { viewer: ctx.userID })
                .then(utils.parseAndCheckLogin(ctx.jar, defaultFuncs))
                .then(function(resData) {
                  if (resData.payload) {
                    var mutualFriendsAliases = (function(arr) {
                      var u = {}, a = [];
                      for(var i = 0, l = arr.length; i < l; ++i){
                        if(u.hasOwnProperty(arr[i])) {
                          continue;
                        }
                        a.push(arr[i]);
                        u[arr[i]] = 1;
                      }
                      return a;
                    })((resData.payload.match(/facebook\.com\/[A-Z,a-z,\.,0-9]+\?fref/g) || []).map(function(alias){ return alias.replace(/facebook\.com\//g, "").replace(/\?fref/g, ""); }));

                    console.log(mutualFriendsAliases);
                  }
                  // else {
                  //   throw resData;
                  // }
                  
                  deferred.resolve();
                })
                .catch(function(err) {
                  log.error("Error in getFriendsList", err);
                  return callback(err);
                });
              })(id, deferred);
          }
          q.when.apply(null, promisesArray).then(callback.bind(null, null, formatData(resData.payload)));
        }
        else {
          callback(null, formatData(resData.payload));
        }
      })
      .catch(function(err) {
        log.error("Error in getFriendsList", err);
        return callback(err);
      });
  };
};
