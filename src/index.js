/**
 * This is a skill built with the Amazon Alexa Skills Kit.
 * The Intent Schema, Custom Slots, and Sample Utterances for this skill, as well as
 * testing instructions are located at https://github.com/btarbox/alexa-more-screen-time
 * 
 * Wabi Sabi Software, all rights reserved, 2016, 2017
 */

var chores = ["done homework", "gotten dressed", "fed the animals"]; // short list for testing
//var chores = ["done homework", "gotten dressed", "fed the animals", "taken out the garbage", "eaten breakfast", "packed lunch"];
var MAX_CHORE = chores.length;
var aws = require('aws-sdk');
var s3 = new aws.S3({ apiVersion: '2006-03-01' });
var date = new Date();
// var tzoffset = new Date().getTimezoneOffset() / 60
var current_hour = date.getHours();  // seems to be on zulu time, will need to adjust this for Alexa local time, not just EST
var current_day = date.getDay();
var MAX_MASTER_CHORE = 0;
var extraTime = 30;
var tzOffset = 6;  // default to US Central Time

// Route the incoming request based on type (LaunchRequest, IntentRequest, etc.) 
// The JSON body of the request is provided in the event parameter.
exports.handler = function (event, context) {
    try {
        //console.log("event.session.application.applicationId=" + event.session.application.applicationId);
        //console.log("event.session.user.userId=" + event.session.user.userId);  /* ID of the user making the request */
        
        if (event.session.application.applicationId !== "amzn1.echo-sdk-ams.app.068e04ab-9c69-4da2-9b0b-018333c82a48") {
             context.fail("Invalid Application ID");
        }

        if (event.session.new) {
            onSessionStarted({requestId: event.request.requestId}, event.session);
        }

        if (event.request.type === "LaunchRequest") {
            onLaunch(context, event.request,
                     event.session,
                     function callback(sessionAttributes, speechletResponse) {
                          context.succeed(buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === "IntentRequest") {
            onIntent(event.request,
                event.session,
                function callback(sessionAttributes, speechletResponse) {
                    context.succeed(buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === "SessionEndedRequest") {
            onSessionEnded(event.request, event.session);
            context.succeed();
        } 
    } catch (e) {
        context.fail("Exception: " + e);
    }
};

function getTimeOfDay() {
    var tod = ""
    var hour = current_hour - tzOffset;
    if(hour < 0) {
        console.log("hour is " + hour + " which becomes " + (hour + 24))
        hour = hour + 24
    }
    current_hour = hour
    if(current_day < 1 || current_day > 5) {
        tod += "WeekendChores.txt";
    } else if(current_hour < 12) {
        tod += "MorningChores.txt";
    } else {
        tod += "AfternoonChores.txt";
    }
    return tod
}

// find the timezone file and then use that to call getChoreListInner to find the actual file
function getChoreList(callback, session) {
    console.log("at getChoreListOuter which finds the tz file if available and then calls getChoreListInner")
    var hashed = require('crypto').createHash('md5').update(session.user.userId).digest('hex');
    const bucket = "lambdaeventsource";
    var keyBase = "MoreScreenTime/";
    var tzFileName = "tzOffset"
    var existingUserKey = keyBase + hashed + "/" + tzFileName
    
    const s3ExistingUserParams = {
        Bucket: bucket,
        Key: existingUserKey
    };
//    const s3NewUserParams = {
//        Bucket: bucket,
//        Key: keyBase + "Default/" + tzFileName
//    };
    
    s3.getObject(s3ExistingUserParams, function(err, data) {
        if (err) {
            console.log("did not find tz file for existing user " + existingUserKey)
            // use default tzOffset, just call getChoreListInner
            getChoreListInner(callback, session)
        } else {
            console.log("found tz file for existing user " + existingUserKey);
            console.log("data is " + data);
            getTZFromFile(data); // sets global tzOffset
            console.log("found tz file for existing user, tzOffset now " + tzOffset)
            getChoreListInner(callback, session)
        }
    });
}

function getChoreListInner(callback, session) {
    // var tzoffset2 = new Date().getTimezoneOffset()
    console.log("about to get chores, hour of the day is " + current_hour + ", day of week is " + current_day + " tzOffset:" + tzOffset);
    console.log(" " + new Date())
    console.log("user id " + session.user.userId);
    var todChores = getTimeOfDay();
    console.log("got time of day file: " + todChores);
    var hashed = require('crypto').createHash('md5').update(session.user.userId).digest('hex');
    console.log("user id hashed " + hashed); 
    const bucket = "lambdaeventsource";
    var keyBase = "MoreScreenTime/";
    var keyDefaultUser = "Default"
    const key = keyBase + keyDefaultUser + todChores
    const keyExistingUser = keyBase + hashed + "/" + todChores
    console.log("key is " + key + ", keyExistingUser is " + keyExistingUser)
    
    const s3ExistingUserParams = {
        Bucket: bucket,
        Key: keyExistingUser
    };
    const s3NewUserParams = {
        Bucket: bucket,
        Key: key
    };
    // console.log("about to get s3 object with chore list for existing user, if not found then look for default chores");
    s3.getObject(s3ExistingUserParams, function(err, data) {
        if (err) {
            console.log("chores not found for existing user " + err + ", try for default user");
            s3.getObject(s3NewUserParams, function(err, data) {
                if (err) {
                    console.log("chores not found for new user");
                } else {
                    console.log("got chores for default user");
                    getChoresFromFile(callback, data, keyDefaultUser);
                }
            });
        } else {
            getChoresFromFile(callback, data, keyExistingUser);
        }
    });
    console.log("past the s3 stuff");
}

function getTZFromFile(data) {
    var body = data.Body.toString('ascii');
    var dataList = body.split(",");
    tzOffset = parseInt(dataList[0])
}

// called twice from getChoreList, once for specific user and once for default
// TODO: add timezone offset to both default and specific user chore lists
function getChoresFromFile(callback, data, whichUser) {
    var body = data.Body.toString('ascii');
    var chorelist = body.split(",");
    console.log("about to getChoresFromFile for user " + whichUser + ", first get tz for user");
    
    console.log("about to parse first chore in getChoresFromFile " + chorelist[0] + " dayOfWeek " + current_day);
    var extraTime = parseInt(chorelist[0]); 
    chorelist.shift();
    console.log("finished parse, got " + extraTime);
    MAX_CHORE = chorelist.length;
    getWelcomeResponse(callback, chorelist, extraTime);  // Dispatch to the skill's launch.
}

function getMasterChoreList(session, callback, intent) {
    console.log("at getMasterChoreList");
    const bucket = "lambdaeventsource";
    var key1 = "MoreScreenTime/MasterChoreList.txt";
    const key = key1;
    const params = {
        Bucket: bucket,
        Key: key
    };
    s3.getObject(params, function(err, data) {
        if (err) {
            console.log("not found " + err);
        } else {
            var body = data.Body.toString('ascii');
            var masterchorelist = body.split(",");
            MAX_MASTER_CHORE = masterchorelist.length;
            console.log("got and parsed MasterChorelist, about to call handleEditChoresRequest " + masterchorelist + " " + MAX_MASTER_CHORE);
            handleEditChoresRequest(session, callback, masterchorelist);  
        }
    });
    console.log("past the masterchorelist s3 stuff");
}

/**
 * Called when the session starts.
 */
function onSessionStarted(sessionStartedRequest, session) {
    console.log("onSessionStarted requestId=" + sessionStartedRequest.requestId + ", sessionId=" + session.sessionId);
}
  
/**
 * Called when the user launches the skill without specifying what they want.
 */
function onLaunch(context, launchRequest, session, callback) {
    console.log("onLaunch requestId=" + launchRequest.requestId + ", sessionId=" + session.sessionId);
    getChoreList(callback, session);
}

/**
 * Called when the user specifies an intent for this skill.
 */
function onIntent(intentRequest, session, callback) {
    console.log("onIntent requestId=" + intentRequest.requestId + ", sessionId=" + session.sessionId);
    console.log("intentRequest is:" + intentRequest)
    
    var intent = intentRequest.intent,intentName = intentRequest.intent.name;
    console.log("got intent " + intentName + ", session:" + session);
    
    // Dispatch to your skill's intent handlers
    if ("HaveYouIntent" === intentName) {
        askChore(intent, session, callback);
    } else if ("IHaveIntent" === intentName) {
        askChore(intent, session, callback);
    } else if ("IHaveNotIntent" === intentName) {
        screenTimeDenied(intent, session, callback);
    } else if ("ScreenIntent" === intentName) {
        askChore(intent, session, callback);
    } else if ("AMAZON.HelpIntent" === intentName) {
        handleHelpRequest(session, callback) // getWelcomeResponse(session, callback, 31); // 2nd param is actually chorelist...FIX
    } else if ("AMAZON.StopIntent" === intentName || "AMAZON.CancelIntent" === intentName) {
        handleSessionEndRequest(callback);
    } else if ("ConfigurationIntent" == intentName) {
        handleConfigurationRequest(session, callback);
    } else if ("ListChoresIntent" == intentName) {
        handleListChoresRequest(session, callback);
    } else if ("AddChoresIntent" == intentName) {
        handleAddChoresRequest(session, callback, intentRequest);
    } else if ("AddThatChoreIntent" == intentName) {
        handleAddThatChoreRequest(session, callback, intentRequest);
    } else if ("SkipThatChoreIntent" == intentName) {
        handleSkipThatChoreRequest(session, callback, intentRequest);
    } else if ("EditChoresIntent" == intentName) {
        getMasterChoreList(session, callback, intentRequest);
    } else if ("FinishedAddingChoresIntent" == intentName) {
        handleFinishedAddingChoresRequest(session, callback);
    } else if ("EndConfigurationIntent" == intentName) {
        getChoreList(callback, session);
    } else if ("SetTimeIntent" == intentName) {
        handleSetTimeRequest(session, callback, intentRequest);
    } else if ("GetTimeIntent" == intentName) {
        handleGetTimeRequest(session, callback, intentRequest);
    } else {
        throw "Invalid intent";
    }
}

function handleHelpRequest(session, callback) {
    
    var cardTitle = "Welcome";
    var repromptText = "something about chores after help";
    var speechOutput = "<p>You start with a default set of chores for morning afternoon and the weekend</p>" +     
      "<p>Answer yes or no about each chore</p>" +
      "<p>If you want to select your own set of chores say configure</p>" +
      "<p>Amazon does not tell us your time zone so we have guess if its morning or afternoon</p>" +
      "<p>You can say</p><p> set the time</p><p> to tell us your local time.</p>";
    var speechOutput2 = "<speak>" + speechOutput + "</speak>";
    callback(session.sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput2, repromptText, true));
}

function handleSetTimeRequest(session, callback, intentRequest) {
    console.log("got to handleSetTimeRequest where we ask the user to tell us the local time")
    var cardTitle = "Welcome";
    var repromptText = "something about chores after help";
    var speechOutput = "<p>Say</p><p> the local time is</p><p>and then a time such as two thirty or three pm</p>"
    var speechOutput2 = "<speak>" + speechOutput + "</speak>";
    callback(session.sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput2, repromptText, false));
}

function handleGetTimeRequest(session, callback, intentRequest) {
    console.log("got to handleGetTimeRequest where we get the time value the user said")
    //console.log("user said1 " + intentRequest.intent.slots);
    //console.log("user said2 " + intentRequest.intent.slots.LocalTime);
    //console.log("user said3 " + intentRequest.intent.slots.LocalTime.name);
    //console.log("user said4 " + intentRequest.intent.slots.LocalTime.toString());
    console.log("user said5 " + intentRequest.intent.slots.LocalTime.value);
    var theLocalTime = intentRequest.intent.slots.LocalTime.value
    // console.log("user said6 " + intentRequest.intent.slots.LocalTime.time);
    var cardTitle = "Welcome";
    var repromptText = "something about chores after help";
    var speechOutput = "<p>Thank you for telling us that the local time is " + theLocalTime + " </p>"
    var speechOutput2 = "<speak>" + speechOutput + "</speak>";
    callback(session.sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput2, repromptText, true));
}

function handleFinishedAddingChoresRequest(session, callback) {
    var chorelist = "oh snap, no chorelist";
    if(session.attributes) {
      chorelist = session.attributes.chorelist;
      extraTime = session.attributes.extaTime;
    }
    getWelcomeResponse(callback, chorelist, extraTime);
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
function onSessionEnded(sessionEndedRequest, session) {
    console.log("onSessionEnded requestId=" + sessionEndedRequest.requestId + ", sessionId=" + session.sessionId);
}

function handleAddChoresRequest(session, callback, intentRequest) {
    var sessionAttributes = {};
    if(session.attributes) {
      sessionAttributes = session.attributes;
    }
    
    console.log("at handleAddChoresRequest " + intentRequest.intent + " " + intentRequest.intent.slots);
    console.log("at handleAddChoresRequest2 " + intentRequest.intent.slots.AddNew);
    console.log("at handleAddChoresRequest3 " + intentRequest.intent.slots.AddNew.value);

    var cardTitle = "Welcome";
    var speechOutput = "<p>You added the chore</p><p>" + intentRequest.intent.slots.AddNew.value + "</p>";
    var speechOutput2 = "<speak>" + speechOutput + "</speak>";
    var repromptText = "something about chores";
    var shouldEndSession = false;
    var hashed = require('crypto').createHash('md5').update(session.user.userId).digest('hex')

    const bucket = "lambdaeventsource";
    const key = "MoreScreenTime/" + hashed + "/NewChores.txt";

    var s3obj = new aws.S3({params: {Bucket: bucket, Key: key}});
    s3obj.upload({Body: intentRequest.intent.slots.AddNew.value}).
      on('httpUploadProgress', function(evt) { console.log(evt); }).
      send(function(err, data) { 
          console.log(err, data) 
          callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput2, repromptText, shouldEndSession));
      });
}

function handleListChoresRequest(session, callback) {
    console.log("at handleListChoresRequest " + session);
    var sessionAttributes = {};
    if(session.attributes) {
      sessionAttributes = session.attributes;
    }
    var cardTitle = "Welcome";
    var speechOutput = "<p>The current set of chores is</p>";
       for(var i=0; i < sessionAttributes.chorelist.length; i++) {
        speechOutput += "<p>" + sessionAttributes.chorelist[i] + "</p>";
    }
    speechOutput += "<p>Say end to finish configuration or edit to change the list of chores</p>";
    var speechOutput2 = "<speak>" + speechOutput + "</speak>";
    console.log("built speech response:" + speechOutput2);
    
    var repromptText = "<p>Say end to finish configuration or edit to change the list of chores</p>";
    var shouldEndSession = false;

    callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput2, repromptText, shouldEndSession));
}

function handleEditChoresRequest(session, callback, masterchorelist) {
    console.log("at handleEditChoresRequest " + session + " masterchorelist " + masterchorelist);
    var sessionAttributes = {};
    if(session.attributes) {
      sessionAttributes = session.attributes;
    }
    sessionAttributes.masterchorelist = masterchorelist;
    sessionAttributes.masterchorelistIndex = 0;  
    sessionAttributes.MAX_MASTER_CHORE = MAX_MASTER_CHORE;
    
    var cardTitle = "Welcome";
    var speechOutput = "<p>We will now build the list of chores you want.</p>"
    speechOutput += "<p>We will list the possible chores</p><p>after each one please say</p><p>add that chore</p><p>or</p><p>skip that chore</p>";
    speechOutput += "<p>add chore" + masterchorelist[0] + "</p>"
    var speechOutput2 = "<speak>" + speechOutput + "</speak>";
    console.log("built speech response:" + speechOutput2);
    
    var repromptText = "<p>unexpected situation while editing chores</p>";
    var shouldEndSession = false;

    callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput2, repromptText, shouldEndSession));
}

/**
 * User said "add that chore" in response to listing the chores
 */
function handleAddThatChoreRequest(session, callback) {
    var sessionAttributes = {};
    if(session.attributes) {
      sessionAttributes = session.attributes;
    }
    console.log("at handleAddThatChoreRequest " + session + "masterchorelistIndex is " + sessionAttributes.masterchorelistIndex + " of " + sessionAttributes.masterchorelist.length);

    if (typeof sessionAttributes.newchorelist == "undefined")  {
        console.log("no newchorelist yet so initialize to chore: " + sessionAttributes.masterchorelistIndex)
        // first element of the list is the amount of extra time they can get
        sessionAttributes.newchorelist = "30, " + sessionAttributes.masterchorelist[sessionAttributes.masterchorelistIndex]
    } else {
        console.log("found newchorelist, adding chore: " + sessionAttributes.masterchorelistIndex)
        sessionAttributes.newchorelist = sessionAttributes.newchorelist + "," + sessionAttributes.masterchorelist[sessionAttributes.masterchorelistIndex]
    }
    console.log("newchorelist now:" + sessionAttributes.newchorelist)
    

    sessionAttributes.masterchorelistIndex = sessionAttributes.masterchorelistIndex + 1
    var cardTitle = "Welcome";
    var speechOutput = "<p>add chore" + sessionAttributes.masterchorelist[sessionAttributes.masterchorelistIndex] + "</p>"
    var repromptText = "<p>unexpected situation while editing chores</p>";
    var shouldEndSession = false;

    console.log("masterchorelistIndex is now " + sessionAttributes.masterchorelistIndex)
    
    if(sessionAttributes.masterchorelistIndex >= sessionAttributes.masterchorelist.length) {
        console.log("finished configuring chores from the master list, about to write to S3")
        speechOutput = "You have finished configuring chores from the master list, about to write to S3"
        const bucket = "lambdaeventsource";
        var hashed = require('crypto').createHash('md5').update(session.user.userId).digest('hex')

        // const key = "MoreScreenTime/NewlyConfiguredChores.txt";
        const key = "MoreScreenTime/" + hashed + "/" + getTimeOfDay()
        console.log("about to write new file " + key)

        var s3obj = new aws.S3({params: {Bucket: bucket, Key: key}});
/*        s3obj.upload({Body: sessionAttributes.newchorelist}).
        on('httpUploadProgress', function(evt) { console.log(evt); }).
            send(function(err, data) { 
            console.log(err, data) 
            callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput2, repromptText, shouldEndSession));
        });
*/
        var speechOutput2 = "<speak>" + "finished configuring chores, goodbye" + "</speak>";
        
        s3obj.upload({Body: sessionAttributes.newchorelist}, function(err, data) {
           console.log(err, data); 
           console.log("finished writing new chores....")
           callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput2, repromptText, true));
        });
        // console.log("after the write to s3 code block");
        // callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput2, repromptText, true));
    }else {
        var speechOutput2 = "<speak>" + speechOutput + "</speak>";
        console.log("about to ask about next possible chore:" + speechOutput2);
        callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput2, repromptText, shouldEndSession));
    }
}
/**
 * User said "add to chore" in response to listing the chores
 */
function handleSkipThatChoreRequest(session, callback) {
    var sessionAttributes = {};
    if(session.attributes) {
      sessionAttributes = session.attributes;
    }
    console.log("at handleSkipThatChoreRequest " + session + "masterchorelistIndex is " + sessionAttributes.masterchorelistIndex + " of " + sessionAttributes.masterchorelist.length);
    sessionAttributes.masterchorelistIndex = sessionAttributes.masterchorelistIndex + 1
    var cardTitle = "Welcome";
    var speechOutput = "<p>add chore" + sessionAttributes.masterchorelist[sessionAttributes.masterchorelistIndex] + "</p>"
    console.log("masterchorelistIndex is now " + sessionAttributes.masterchorelistIndex)
    
    if(sessionAttributes.masterchorelistIndex >= sessionAttributes.masterchorelist.length) {
        speechOutput = "You have finished configuring chores from the master list"
    }
    var speechOutput2 = "<speak>" + speechOutput + "</speak>";
    console.log("built speech response:" + speechOutput2);
    
    var repromptText = "<p>unexpected situation while editing chores</p>";
    var shouldEndSession = false;

    callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput2, repromptText, shouldEndSession));
}


function handleConfigurationRequest(session, callback) {
    console.log("at handleConfigurationRequest");
    var sessionAttributes = {};
    var cardTitle = "Welcome";
    var speechOutput1 = "<p>Do you want to list chores or edit chores?</p>"; 
    var speechOutput = "<speak>" + speechOutput1 + "</speak>";

    var repromptText = "Do you want to list chores or edit chores?";
    var shouldEndSession = false;
    if(session.attributes) {
      sessionAttributes = session.attributes;
    }
    callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
}
// --------------- Functions that control the skill's behavior -----------------------

function getWelcomeResponse(callback, chorelist, extraTime) {
    // If we wanted to initialize the session to have some attributes we could add those here.
    console.log("at getWelcomeResponse with " + chorelist.length + " chores.");
    var sessionAttributes = {};
    sessionAttributes.chorelist = chorelist;
    sessionAttributes.extraTime = extraTime;
    console.log("assigned chorelist parameter to sessionAttributes, and extraTime " + sessionAttributes.extraTime + " current_day " + current_day);
    
    var cardTitle = "Welcome";
    var dayStr = ""
    if(current_day < 1 || current_day > 5) {
        dayStr = " weekend "
    } else if(current_hour < 12) {
        dayStr = " morning "
    } else {
        dayStr = " afternoon "
    }

    var speechOutput1 = "<p>Welcome to screen time.</p> <p>Say help to get directions</p>"
    speechOutput1 += "<p>Checking your " + dayStr + " chores</p>"
    speechOutput1 += "Have you " + chorelist[0]; 
    var speechOutput = "<speak>" + speechOutput1 + "</speak>";
    // speechOutput = speechOutput.replace('"', ' ')
    console.log("about to say:" + speechOutput + ".");
    // If the user either does not reply to the welcome message or says something that is not
    // understood, they will be prompted again with this text.
    var repromptText = "something about chores";
    var shouldEndSession = false;

    callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
}

function handleSessionEndRequest(callback) {
    var cardTitle = "Session Ended";
    var speechOutput = "Thank you for using more screen time";
    // Setting this to true ends the session and exits the skill.
    var shouldEndSession = true;

    callback({}, buildSpeechletResponse(cardTitle, speechOutput, null, shouldEndSession));
}

function screenTimeDenied(intent, session, callback) {
    console.log("top of screenTimeDenied intent:" + intent.name);
    var sessionAttributes = {};
    if(session.attributes) {
       sessionAttributes = session.attributes;
    }
    if (typeof sessionAttributes.choreCounter == "undefined")  {
        console.log("sessionAttributes.choreCounter is undefined in screenTimeDenied");
        sessionAttributes.choreCounter = 0;
    } else {
        sessionAttributes.choreCounter = sessionAttributes.choreCounter -1
    }    
    speechOutput = "<p>You have not completed all your chores so you may not have more screen time</p>";
    speechOutput += "You have ";
    for(var i=0; i < sessionAttributes.choreCounter; i++) {
        speechOutput += sessionAttributes.chorelist[i] + " ";
    }
    speechOutput += "  but you have not ";
    for(i=sessionAttributes.choreCounter; i < MAX_CHORE; i++) {
        speechOutput += sessionAttributes.chorelist[i] + " ";
    }
    speechOutput += "<p>And remember</p><p> all us electronic devices talk to each other</p><p> so we will know if you cheat.</p>"
    var speechOutput2 = "<speak>" + speechOutput + "</speak>";
    var shouldEndSession = true;
    callback(sessionAttributes,
         buildSpeechletResponse("Request Denied", speechOutput2, "goodbye", shouldEndSession));
}

/**
 * Ask about chores and handle the replies.
 */
function askChore(intent, session, callback) {
    console.log("top of askChore intent:" + intent.name);
    var cardTitle = "ChoreDressed";
    var sessionAttributes = {};
    var choreCounter = 2;
    
    if(session.attributes) {
      sessionAttributes = session.attributes;
      console.log("got session.attributes")
      if(typeof sessionAttributes.chorelist == "undefined") {
          console.log("sadly, no chorelist in sessionAttributes")
      } else {
          console.log("got chorelist from sessionAttributes, length: " + sessionAttributes.chorelist.length)
      }
    }
    console.log("got here too");
    if (typeof sessionAttributes.choreCounter == "undefined")  {
        console.log("sessionAttributes.choreCounter is undefined");
        sessionAttributes.choreCounter = 1;
    } else {
        console.log("chore counter is " + sessionAttributes.choreCounter);
    }
    console.log("here, extraTime = " + sessionAttributes.extraTime);
    var shouldEndSession = false;
    if(!intent.slots.Chore) {
       console.log("no chore yet, must be first time");
       speechOutput = "first question, have you gotten dressed";
       sessionAttributes.choreCounter = 1;
       console.log("set sessionAttributes.choreCounter = 0");
    }else if(sessionAttributes.choreCounter < MAX_CHORE) {
       console.log("some chores, " + sessionAttributes.choreCounter);
       console.log("next ask " + chores[sessionAttributes.choreCounter]);
       var myChore = intent.slots.Chore;
     
       //sessionAttributes.chores = session.attributes.chores;
       console.log("chore counter = " + sessionAttributes.choreCounter.value);
       // speechOutput = "have you " + chores[sessionAttributes.choreCounter];
       speechOutput = "have you " + sessionAttributes.chorelist[sessionAttributes.choreCounter];
       sessionAttributes.choreCounter += 1;
    } else {
        speechOutput = "<p>Yes,</p> you may have " + sessionAttributes.extraTime + " more minutes of screen time";
        shouldEndSession = true
    }
    repromptText = "bla";

    var speechOutput2 = "<speak>" + speechOutput + "</speak>";
    callback(sessionAttributes,
         buildSpeechletResponse(cardTitle, speechOutput2, repromptText, shouldEndSession));
}


// --------------- Helpers that build all of the responses -----------------------

function buildSpeechletResponse(title, output, repromptText, shouldEndSession) {
    return {
        outputSpeech: {
            "type": "SSML",
            "ssml": output // "<speak><p>This output speech</p> uses SSML</speak>"
        },
        card: {
            type: "Simple",
            title: "SessionSpeechlet - " + title,
            content: "SessionSpeechlet - " + output
        },
        reprompt: {
            outputSpeech: {
                type: "PlainText",
                text: repromptText
            }
        },
        shouldEndSession: shouldEndSession
    };
}

function buildResponse(sessionAttributes, speechletResponse) {
    return {
        version: "1.0",
        sessionAttributes: sessionAttributes,
        response: speechletResponse
    };
}
