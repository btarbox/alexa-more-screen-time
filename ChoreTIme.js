var languageStrings = {
    'en': {
        'translation': {
            'WELCOME'  : "Welcome to More Screen Time, lets see if your child has done their chores<break time='750ms'/> ",
            'MINI_HELP': "Welcome to More Screen Time, Answer yes, no or they don't have to after each question about your child's chore<break time='500ms'/> ",
            'HELP'     : "We get chores based on morning, afternoon or weekend and ask if your child has done them.  You say yes or no to each chore.  If your child has done all of" +
            " their chores they are allowed more screentime, otherwise not.  You can also say, they don't have to.  This means the chore isn't required and we will no longer" +
            " ask you about it.  You can also say, reset, to get back to the full list of chores<break time='750ms'/> ",
            'ABOUT'    : "More Screen Time makes a child control their own screen time.",
            'STOP'     : "Okay, see you next time!"
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
var choreIndexesToRemove = '';
var invocation_count = 0;

exports.handler = function(event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.dynamoDBTableName = 'ChoreTimeChores';  // store per-user session information
    alexa.resources = languageStrings;
    alexa.registerHandlers(handlers);
    alexa.execute();
};

var handlers = {
    'LaunchRequest': function () {
        // var say = this.t('WELCOME') + this.t('HELP');
        invocation_count = this.attributes['invocation_count'];
        if (typeof invocation_count == "undefined") {
            console.log('invocation_count was not found in dynamo, initializing it to 1');
            this.attributes['invocation_count'] = 1;
            invocation_count = 1;
        } else {
            invocation_count += 1;
            this.attributes['invocation_count'] = invocation_count;
            console.log("invocation_count incremented to " + invocation_count);
        }
        console.log("at launch request, checking dynamoDB for last result: " +  this.attributes['lastChoreResult'] + " and invocation count:" + invocation_count);
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

    'DontHaveToIntent': function () {  // user said the chore doesn't apply to them
        handleSaidDontHaveTo(this);
    },

    'ResetChoresIntent': function () {
        handleResetChores(this);
    },

    'AMAZON.HelpIntent': function () {
        choreIndex -= 1;  // repeat the existing chore question
        askAboutAChore(this.t('HELP'), this)
        // this.emit(':ask', this.t('HELP'));
    },

    'AMAZON.CancelIntent': function () {
        this.emit(':tell', this.t('STOP'));
    },
    'AMAZON.StopIntent': function () {
        this.emit(':tell', this.t('STOP'));
    },

    'Unhandled': function() {
        console.log('got to the unhandled state');
        this.emit(':tell', this.t('STOP'));
    }
};

function handleResetChores(emmiter) {
    console.log("at handleResetChores...not yet implemented");
    emmiter.emit(':tell', this.t('STOP'));
}

function handleSaidYes(emmiter) {
    console.log("at handleSaidYes");
    if(choreIndex >= maxChores) {
        handleScreenTimeAllowed(emmiter);
    } else {
        askAboutAChore("", emmiter);
    }
}

// this is the same as handleSaidYes except that we also remember this is a chore to skip forever
function handleSaidDontHaveTo(emmiter) {
    var removeIndex = choreIndex - 1;
    choreIndexesToRemove += removeIndex + ',';
    console.log("at handleSaidDontHaveTo; remove chore:" + removeIndex + " " + chores[removeIndex] + "; choreIndexesToRemove:" + choreIndexesToRemove);
    if(choreIndex >= maxChores) {
        handleScreenTimeAllowed(emmiter);
    } else {
        askAboutAChore("", emmiter);
    }
}

function handleScreenTimeAllowed(emmiter) {
    var choreAttribute = dynamoChoresName;
    console.log("at handleScreenTimeAllowed," + choreIndexesToRemove + ", storing chores in dynamo:" + choreAttribute);
    emmiter.attributes['lastChoreResult'] = 'allowed';
    emmiter.attributes['invocation_count'] = invocation_count;
    stripChores();
    ///emmiter.attributes[choreAttribute] = chores;
    var say = "<p>Your child may have more screen time</p>";
    emmiter.emit(':tell', say);
}

function handleScreenTimeDenied(emmiter) {
    var choreAttribute = dynamoChoresName;
    console.log("at handleScreenTimeDenied," + choreIndexesToRemove + "  storing chores in dynamo:" + choreAttribute);
    emmiter.attributes['lastChoreResult'] = 'denied';
    emmiter.attributes['invocation_count'] = invocation_count;

    stripChores();
    ////emmiter.attributes[choreAttribute] = chores;
    var say = "<p>Your child has not completed all their chores so they may not have more screen time</p>";
    emmiter.emit(':tell', say);
}

function askAboutAChore(preamble, emmiter) {
    console.log("at askAboutAChore:" + choreIndex + " of " + maxChores + " preamble:"+preamble);
    var nextChore = chores[choreIndex];
    choreIndex = choreIndex + 1;

    var say = preamble + 'Have they ' + nextChore;
    emmiter.emit(':ask', say, 'next prompt');
}


// ----------------------- utility methods -----------------------

function stripChores() {
    var choresRemovedSoFar = 0;
    console.log("about to strip I dont have to chores; original chorelist: " + chores + " choreIndexesToRemove:" + choreIndexesToRemove);
    var ignored = choreIndexesToRemove.split(",").map(function (index) {
        if(index.length > 0) {
            console.log("about to remove " + index + " from chorelist");
            var indexNum = Number(index) - choresRemovedSoFar;
            choresRemovedSoFar += 1;
            chores.splice(indexNum, 1);
            console.log("chores now:" + chores);
        }
        return 42;  // not sure if I need this just for syntax
    });
}

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
        maxChores = chores.length;
        console.log("found existing chore list for this user:" + dynamoChores + " going directly to askAboutAChore with " + maxChores + " chores");
        askAboutAChore(buildWelcome(emmiter), emmiter);
        return;
    }

    console.log("got time of day file: " + todChores);
    const bucket = "lambdaeventsource";
    var keyBase = "MoreScreenTime/";
    var keyDefaultUser = "Default";
    const key = keyBase + keyDefaultUser + todChores;
    console.log("key is " + key);

    const s3NewUserParams = {
        Bucket: bucket,
        Key: key
    };

    console.log("about to get s3 object with chore list for default chores");
    s3.getObject(s3NewUserParams, function(err, data) {
        if (err) {
            console.log("chores not found for default user " + err);
        } else {
            getChoresFromFileAndWelcomeUser(emmiter, data, key);
        }
    });
}

// called from getChoreList, for default user
function getChoresFromFileAndWelcomeUser(emmiter, data, whichUser) {
    var body = data.Body.toString('ascii');
    var chorelist = body.split(",");
    console.log("got ChoresFromFile for user " + whichUser );

    console.log("about to parse first chore in getChoresFromFile " + chorelist[0] + " dayOfWeek " + current_day);
    var extraTime = 30
    chorelist.shift();
    chores = chorelist;
    console.log("finished parse, got " + extraTime);
    maxChores = chorelist.length;
    askAboutAChore(buildWelcome(emmiter), emmiter);
}

function buildWelcome(emmiter) {
    var percent = Math.random() * 12;  // a random number between 0 and 12
    console.log('at buildWelcome, percent:' + percent + " invocation_count:" + invocation_count);
    if (invocation_count < percent) {
        return emmiter.t('MINI_HELP');
    } else {
        return emmiter.t('WELCOME');
    }
}
