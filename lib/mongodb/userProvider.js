/* eslint one-var:0, no-var:0, func-names:0, prefer-arrow-callback:0, prefer-template:0 */
/* eslint max-len:160 */
/*
 * MongoDB Backend for Users
 *
 * User
 * u: name
 * p: hash?
 * e: email
 * m: {}
 *  j: join date
 *
 */

var userRegex = /^[0-9a-z\.\-_]+$/i;

var crypto = require('crypto'),
  ObjectID = require('mongodb').ObjectID,
  UserProvider = function (database) {
    this.db = database;
  };

UserProvider.prototype.findOne = function (user, callback) {
  if (userRegex.test(user.username)) {
    this.db.findOne({
      u: new RegExp('^' + user.username + '$', 'i')
    }, function (error, results) {
      if (error) callback(error); else {
        callback(null, results);
      }
    });
  } else {
    callback('Invalid Username');
  }
};

UserProvider.prototype.findById = function (id, callback) {
  this.db.findOne({
    _id: new ObjectID(id)
  }, function (error, results) {
    if (error) callback(error); else {
      callback(null, results);
    }
  });
};

UserProvider.prototype.validate = function (user, password) {
  return (user.p === crypto.createHash('sha256').update(password).digest('hex'));
};

UserProvider.prototype.findByToken = function (token, callback) {
  this.db.findOne({
    't.k': token
  }, function (error, results) {
    if (error) callback(error); else {
      callback(null, results);
    }
  });
};


// Remove users who registered but haven't activated their account by the three day mark
UserProvider.prototype.reaper = function (callback) {
  var d = new Date();
  d = new Date(d.setDate(d.getDate() - 3));
  this.db.remove({
    't.x': {
      $lt: d
    }
  }, function (error, result) {
    if (error) callback(error);
    else callback(null, result);
  });
};

UserProvider.prototype.dropToken = function (user, callback) {
  this.db.update({
    _id: user._id
  }, {
    $unset: {
      t: 1
    }
  }, {
    safe: true
  }, function (err, result) {
    if (err) callback(err);
    else callback(null, result);
  });
};

UserProvider.prototype.createUser = function (user, password, emailaddress, callback) {
  var that = this;
  var r = /^(([^<>()[\]\\.,;:\s@']+(\.[^<>()[\]\\.,;:\s@']+)*)|('.+'))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  if (password.length < 6) {
    callback('Password needs to be at least six characters long.', null);
  } else if (user.length < 3) {
    callback('Username needs to be at least three characters long.', null);
  } else if (emailaddress.length < 6) {
    callback('You need to validate your email to use the board and the one you gave is clearly fake. Try again.', null);
  } else if (!r.test(emailaddress)) {
    callback('Invalid Email');
  } else {
    if (userRegex.test(user)) {
      that.findOne({
        username: user
      }, function (error, result) {
        if (error) {
          callback(error, null);
        } else if (result && result.u && result.u == user) {
          callback('User already exists, if you have javascript on you should have seen a message saying as much.', null);
        } else {
          var token = crypto.createHash('sha1').update(user + (new Date()).getTime() + password).digest('hex').substr(Math.floor((Math.random() * 30) + 1), 8);
          password = crypto.createHash('sha256').update(password).digest('hex');
          user = {
            u: user,
            p: password,
            e: emailaddress,
            m: {
              j: new Date()
            },
            t: {
              k: token,
              x: new Date()
            }
          };
          this.db.insert(user, function (err, result) {
            if (error) callback(error);
            else callback(null, result[0]); //Returns an array when there should only ever be one result so we select 0.
          });
        }
      });
    } else {
      callback('Invalid characters in username. A-z, 0-9, and ._- are allowed. _ will be shown as a space for reference.');
    }
  }
};


exports.UserProvider = UserProvider;
