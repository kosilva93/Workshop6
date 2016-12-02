var express = require('express');
var app = express();

var database = require('./database');
var readDocument = database.readDocument;

var bodyParser = require('body-parser');
app.use(bodyParser.text());

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});

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
