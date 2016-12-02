var express = require('express');
var app = express();

var database = require('./database');
var readDocument = database.readDocument;
var addDocument = database.addDocument;
var writeDocument = database.readDocument;

var StatusUpdateSchema = require('./schemas/statusupdate.json');
var validate = require('express-jsonschema').validate;

var bodyParser = require('body-parser');
app.use(bodyParser.text());
app.use(bodyParser.json());

app.use(express.static('../client/build'));

function getFeedItemSync(feedItemId) {
  var feedItem = readDocument('feedItems', feedItemId);
  // Resolve 'like' counter.
  feedItem.likeCounter = feedItem.likeCounter.map((id) => readDocument('users', id));
  // Assuming a StatusUpdate. If we had other types of FeedItems in the DB, we would
  // need to check the type and have logic for each type.
  feedItem.contents.author = readDocument('users', feedItem.contents.author);
  // Resolve comment author.
  feedItem.comments.forEach((comment) => {
    comment.author = readDocument('users', comment.author);
  });
  return feedItem;
}

/**
 * Emulates a REST call to get the feed data for a particular user.
 */
function getFeedData(user) {
  var userData = readDocument('users', user);
  var feedData = readDocument('feeds', userData.feed);
  // While map takes a callback, it is synchronous, not asynchronous.
  // It calls the callback immediately.
  feedData.contents = feedData.contents.map(getFeedItemSync);
  // Return FeedData with resolved references.
  return feedData;
}

app.get('/user/:userid/feed', function(req, res) {
// URL parameters are stored in req.params
var userid = req.params.userid;
// Send response.
res.send(getFeedData(userid));
});

function getUserIdFromToken(authorizationLine) {
  try {
    var token = authorizationLine.slice(7);

    var regularString = new Buffer(token, 'base64').toString('utf8');

    var tokenObj = JSON.parse(regularString);
    var id = tokenObj['id'];

    if (typeof id === 'number') {
      return id;
    } else {

      return -1;
    }
  } catch (e) {

    return -1;
  }
}

app.get('/user/:userid/feed', function(req, res) {
  var userid = req.params.userid;
  var fromUser = getUserIdFromToken(req.get('Authorization'));
  var useridNumber = parseInt(userid, 10);
  if (fromUser === useridNumber) {

    res.send(getFeedData(userid));
  } else {

    res.status(401).end();
  }
});

function postStatusUpdate(user, location, contents) {
  var time = new Date().getTime();

  var newStatusUpdate = {
    "likeCounter": [],
    "type": "statusUpdate",
    "contents": {
      "author": user,
      "postDate": time,
      "location": location,
      "contents": contents,
      "likeCounter": []
    },
    "comments": []
  };

  newStatusUpdate = addDocument('feedItems', newStatusUpdate);

  var userData = readDocument('users', user);
  var feedData = readDocument('feeds', userData.feed);
  feedData.contents.unshift(newStatusUpdate._id);

  writeDocument('feeds', feedData);

  return newStatusUpdate;
}

app.post('/feeditem', validate({ body: StatusUpdateSchema }), function(req, res) {
  var body = req.body;
  var fromUser = getUserIdFromToken(req.get('Authorization'));

  if (fromUser === body.userId) {
    var newUpdate = postStatusUpdate(body.userId, body.location,
      body.contents);
      res.status(201);
      res.set('Location', '/feeditem/' + newUpdate._id);
      res.send(newUpdate);
    } else {

      res.status(401).end();
    }
});

app.use(function(err, req, res, next) {
  if (err.name === 'JsonSchemaValidation') {
    res.status(400).end();
  } else {
    next(err);
  }
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});
