var languageStrings = {
    'en': {
        'translation': {
            'WELCOME' : "Welcome to Chore Time, ",
            'HELP'    : " this is the help for chore time ",
            'ABOUT'   : "chores are cool.",
            'STOP'    : "Okay, see you next time!"
        }
    }
    // , 'de-DE': { 'translation' : { 'TITLE'   : "Local Helfer etc." } }
};

var Alexa = require('alexa-sdk');
const aws = require('aws-sdk');
var s3 = new aws.S3({ apiVersion: '2006-03-01' });
var chores = ["done homework", "gotten smartly dressed", "fed the animals", "taken out the trash"];
var choreIndex = 0;
var maxChores = 4;
var tzOffset = 6;  // default to US Central Time unless customer tells us otherwise
var date = new Date();
var current_hour = date.getHours();  // zulu time, will need to adjust this for Alexa local time
var current_day = date.getDay();
var dynamoChoresName = '';
var dynamoChores = '';
var todChores = '';

exports.handler = function(event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.dynamoDBTableName = 'ChoreTimeChores';  // store per-user session information
    alexa.resources = languageStrings;
    alexa.registerHandlers(handlers);
    alexa.execute();
};

var handlers = {
    'LaunchRequest': function () {
        var say = this.t('WELCOME') + this.t('HELP');
        console.log("at launch request, checking dynamoDB for last result: " +  this.attributes['lastChoreResult']);
        choreIndex = 0;  // not sure why I need this here but w/o it choreIndex start == 1
        getChoreListAndWelcomeUser(this);
    },

    'AboutIntent': function () {
        this.emit(':tell', this.t('ABOUT'));
    },

    'HaveTheyIntent': function () { // don't think this is ever called
        handleAskChore(this);       // user doesn't say "have they", Alexa says that
    },

    'TheyHaveIntent': function () {  // user said yes
        handleSaidYes(this);
    },

    'TheyHaveNotIntent': function () {  // user said no
        handleScreenTimeDenied(this);
    },

    'AMAZON.HelpIntent': function () {
        this.emit(':ask', this.t('HELP'));
    },
    'AMAZON.CancelIntent': function () {
        this.emit(':tell', this.t('STOP'));
    },
    'AMAZON.StopIntent': function () {
        this.emit(':tell', this.t('STOP'));
    }
};

function handleSaidYes(emmiter) {
    console.log("at handleSaidYes");
    if(choreIndex >= maxChores) {
        handleScreenTimeAllowed(emmiter);
    } else {
        askAboutAChore(emmiter);
    }
}

function handleScreenTimeAllowed(emmiter) {
    var choreAttribute = dynamoChoresName; //'weekendchores';
    console.log("at handleScreenTimeAllowed, storing chores in dynamo:" + choreAttribute);
    emmiter.attributes['lastChoreResult'] = 'allowed';
    emmiter.attributes[choreAttribute] = chores;
    var say = "<p>Your child may have more screen time</p>";
    emmiter.emit(':tell', say);
}
function handleScreenTimeDenied(emmiter) {
    var choreAttribute = dynamoChoresName; //'weekendchores';
    console.log("at handleScreenTimeDenied, storing chores in dynamo:" + choreAttribute);
    emmiter.attributes['lastChoreResult'] = 'denied';
    emmiter.attributes[choreAttribute] = chores;
    var say = "<p>Your child has not completed all their chores so they may not have more screen time</p>";
    emmiter.emit(':tell', say);
}

function askAboutAChore(emmiter) {
    console.log("at askAboutAChore:" + choreIndex);
    var nextChore = chores[choreIndex];
    choreIndex = choreIndex + 1;

    var say = 'Have they ' + nextChore;
    emmiter.emit(':ask', say, 'next prompt');
}


// ----------------------- utility methods -----------------------

function getTimeOfDay() {
    var tod = "";
    var hour = new Date().getHours() - tzOffset;
    console.log("at getTimeOfDay current_hour:" + current_hour + " offset:" + tzOffset + " hour:"+ hour)
    if(hour < 0) {  // deal with crossing the day boundary with the TZ
        console.log("hour is " + hour + " which becomes " + (hour + 24));
        hour = hour + 24;
        current_day = current_day - 1;
        if(current_day < 1) {
            current_day = 7;
        }
    }
    current_hour = hour;
    if(current_day < 1 || current_day > 5) {
        tod += "Weekend";
    } else if(current_hour < 12) {
        tod += "Morning";
    } else {
        tod += "Afternoon";
    }
    return tod;
}

// Get the day/time specific chore list, either from Dynamo (user specific) or S3 (generic) then ask user about first chore
function getChoreListAndWelcomeUser(emmiter) {
    console.log("about to get chores, hour of the day is " + current_hour + ", day of week is " + current_day + " tzOffset:" + tzOffset);
    console.log(" " + new Date());
    var todChores = getTimeOfDay() + "Chores.txt";
    dynamoChoresName = getTimeOfDay();
    dynamoChores = emmiter.attributes[dynamoChoresName];
    console.log(dynamoChoresName + " from dynamo got:" + dynamoChores);
    if (typeof dynamoChores == "undefined") {
        console.log("did not find existing chore list for this user");
    } else {
        chores = dynamoChores;
        MAX_CHORE = chores.length + 1;
        console.log("found existing chore list for this user:" + dynamoChores + " going directly to askAboutAChore with " + MAX_CHORE + " chores");
        askAboutAChore(emmiter);
        return;
    }

    console.log("got time of day file: " + todChores);
    var hashed = '1234'; //require('crypto').createHash('md5').update(session.user.userId).digest('hex');
    console.log("user id hashed " + hashed);
    const bucket = "lambdaeventsource";
    var keyBase = "MoreScreenTime/";
    var keyDefaultUser = "Default";
    const key = keyBase + keyDefaultUser + todChores;
    const keyExistingUser = keyBase + hashed + "/" + todChores;
    console.log("key is " + key + ", keyExistingUser is " + keyExistingUser);

    const s3ExistingUserParams = {
        Bucket: bucket,
        Key: keyExistingUser
    };
    const s3NewUserParams = {
        Bucket: bucket,
        Key: key
    };

    console.log("about to get s3 object with chore list for existing user, if not found then look for default chores");
    s3.getObject(s3ExistingUserParams, function(err, data) {
        if (err) {
            console.log("chores not found for existing user " + err + ", try for default user");
            s3.getObject(s3NewUserParams, function(err, data) {
                if (err) {
                    console.log("chores not found for new user");
                } else {
                    console.log("got chores for default user");
                    getChoresFromFileAndWelcomeUser(emmiter, data, keyDefaultUser);
                }
            });
        } else {
            getChoresFromFileAndWelcomeUser(emmiter, data, keyExistingUser);
        }
    });
}

// called twice from getChoreList, once for specific user and once for default
function getChoresFromFileAndWelcomeUser(emmiter, data, whichUser) {
    var body = data.Body.toString('ascii');
    var chorelist = body.split(",");
    console.log("about to getChoresFromFile for user " + whichUser + ", first get tz for user");

    console.log("about to parse first chore in getChoresFromFile " + chorelist[0] + " dayOfWeek " + current_day);
    var extraTime = 30
    chorelist.shift();
    chores = chorelist;
    console.log("finished parse, got " + extraTime);
    MAX_CHORE = chorelist.length;
    askAboutAChore(emmiter);
}
