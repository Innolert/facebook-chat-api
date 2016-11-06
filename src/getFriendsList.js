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
      mutualFriends: user.mutualFriends
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
            keysAndIds = Object.keys(resData.payload).map(function(key) { return { key: key, id: resData.payload[key].id.toString() }; }),
            i = keysAndIds.length;

          while(i--) {
            var keyAndId = keysAndIds[i],
              deferred = q.defer();

            promisesArray.push(deferred.promise);

            var checkerFunc = function(keyAndId, deferred,mutualFriendsAliases, cursor) {
              mutualFriendsAliases = mutualFriendsAliases || [];

              var id = keyAndId.id,
                key = keyAndId.key;

              defaultFuncs
                .get("https://www.facebook.com/ajax/pagelet/generic.php/FriendsAppCollectionPagelet", ctx.jar, { "data": { "collection_token": id + ":2356318349:3", "cursor": cursor, "profile_id": parseInt(id) } }, { viewer: ctx.userID })
                .then(utils.parseAndCheckLogin(ctx.jar, defaultFuncs))
                .then(function(resData) {
                  var partialMutualFriendsAliases = [],
                    id = this.keyAndId.id,
                    key = this.keyAndId.key,
                    doneRetrievingMutualFriends = false;

                  if (resData.payload) {
                    partialMutualFriendsAliases = (function(arr) {
                      var u = {}, a = [];
                      for(var i = 0, l = arr.length; i < l; ++i){
                        if(u.hasOwnProperty(arr[i])) {
                          continue;
                        }
                        a.push(arr[i]);
                        u[arr[i]] = 1;
                      }
                      return a;
                    })((resData.payload.match(/(facebook\.com\/profile.php\?id=[0-9]+&|facebook\.com\/[A-Z,a-z,\.,0-9]+\?fref)/g) || []).map(function(alias){ return alias.replace(/(facebook\.com\/|\?fref|profile\.php\?id=|&)/g, ""); }));
                  }

                  if (partialMutualFriendsAliases.length > 0 && resData.jsmods && resData.jsmods.require) {
                    var newCursor,
                      require = resData.jsmods.require,
                      i = require.length;
                    while(i--) {
                      if (require[i][0] === "TimelineAppCollection") {
                        newCursor = require[i][3][2];
                        break;
                      }
                    }

                    if (newCursor) {
                      mutualFriendsAliases = mutualFriendsAliases.concat(partialMutualFriendsAliases);
                      checkerFunc(this.keyAndId, deferred, mutualFriendsAliases, newCursor);
                      return;
                    }
                  }
                  deferred.resolve({ key: key, mutualFriends: mutualFriendsAliases });
                }.bind({ keyAndId: keyAndId }))
                .catch(function(err) {
                  deferred.resolve({ key: key, mutualFriends: null });
                  log.error("Error in getMutualFriends for key: " + key, err);
                  return callback(err);
                });
            }
            checkerFunc(keyAndId, deferred);
          }
          q.when(q.all(promisesArray), function(mutualFriendsArray) {
            var i = mutualFriendsArray.length;
            while(i--) {
              if (mutualFriendsArray[i].key) {
                if (!resData.payload[mutualFriendsArray[i].key]) {
                  resData.payload[mutualFriendsArray[i].key] = {};
                }
                resData.payload[mutualFriendsArray[i].key].mutualFriends = mutualFriendsArray[i].mutualFriends;
              }
            }
            callback(null, formatData(resData.payload));
          });
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
