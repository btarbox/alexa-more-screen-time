/**
 * This is a skill built with the Amazon Alexa Skills Kit.
 * The Intent Schema, Custom Slots, and Sample Utterances for this skill, as well as
 * testing instructions are located at https://github.com/btarbox/alexa-more-screen-time
 * 
 * Wabi Sabi Software, all rights reserved, 2016
 */

var chores = ["done homework", "gotten dressed", "fed the animals"]; // short list for testing
//var chores = ["done homework", "gotten dressed", "fed the animals", "taken out the garbage", "eaten breakfast", "packed lunch"];
var MAX_CHORE = chores.length;
var aws = require('aws-sdk');
var s3 = new aws.S3({ apiVersion: '2006-03-01' });
var date = new Date();
var current_hour = date.getHours() - 4;
var current_day = date.getDay();

var extraTime = 29

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

function getChoreList(callback) {
    console.log("about to get chores, hour of the day is " + current_hour + ", day of week is " + current_day)
    const bucket = "lambdaeventsource";
    var key1 = "MoreScreenTime/";
    if(current_day < 1 || current_day > 5) {
        key1 += "DefaultWeekendChores.txt"
    } else if(current_hour < 12) {
        key1 += "DefaultChores.txt"
    } else {
        key1 += "DefaultChoresAfternoon.txt"
    }
    const key = key1
    const params = {
        Bucket: bucket,
        Key: key
    };
    // console.log("about to get s3 object with chore list");
    s3.getObject(params, function(err, data) {
        if (err) {
            console.log("not found " + err);
        } else {
            // console.log('found file ', data.ContentType);
            var body = data.Body.toString('ascii');
            // console.log("file contents: " + body);
            // var str = "123, 124, 234,252";
            var chorelist = body.split(",");
            // var arr = body.split(",").map(function (val) { return +val + 1; });
            // console.log("split chores into array (hopefully) " + chorelist);
            // console.log("There are " + chorelist.length + " chores: " + chorelist[0] + ";" + chorelist[1] + ";");
            
            console.log("about to parse first chore for extraTime " + chorelist[0] + " dayOfWeek " + current_day)
            var extraTime = parseInt(chorelist[0]); 
            chorelist.shift()
            console.log("finished parse, got " + extraTime)
            MAX_CHORE = chorelist.length;
            // console.log("about to call getWelcomeResponse with callback");
            getWelcomeResponse(callback, chorelist, extraTime);  // Dispatch to the skill's launch.
        }
    });
    // NOTE: all the following needs to be inside the s3.getObject callback or else that callback never
    // has a chance to finish
    console.log("past the s3 stuff");
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

    getChoreList(callback);
}

/**
 * Called when the user specifies an intent for this skill.
 */
function onIntent(intentRequest, session, callback) {
    console.log("onIntent requestId=" + intentRequest.requestId + ", sessionId=" + session.sessionId);

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
        getWelcomeResponse(session, callback, 31); // 2nd param is actually chorelist...FIX
    } else if ("AMAZON.StopIntent" === intentName || "AMAZON.CancelIntent" === intentName) {
        handleSessionEndRequest(callback);
    } else if ("ConfigurationIntent" == intentName) {
        handleConfigurationRequest(session, callback);
    } else if ("ListChoresIntent" == intentName) {
        handleListChoresRequest(session, callback);
    } else if ("AddChoresIntent" == intentName) {
        handleAddChoresRequest(session, callback, intentRequest);
    } else if ("FinishedAddingChoresIntent" == intentName) {
        handleFinishedAddingChoresRequest(session, callback);
    } else if ("EndConfigurationIntent" == intentName) {
        getChoreList(callback);
    } else {
        throw "Invalid intent";
    }
}

function handleFinishedAddingChoresRequest(session, callback) {
    // get chorelist from session....
    var chorelist = "oh snap, no chorelist";
    if(session.attributes) {
      chorelist = session.attributes.chorelist;
      extraTime = session.attributes.extaTime
    }
    getWelcomeResponse(callback, chorelist, extraTime)
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
function onSessionEnded(sessionEndedRequest, session) {
    console.log("onSessionEnded requestId=" + sessionEndedRequest.requestId + ", sessionId=" + session.sessionId);
    // Add cleanup logic here
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

    const bucket = "lambdaeventsource";
    const key = "MoreScreenTime/NewChores.txt";

    var s3obj = new aws.S3({params: {Bucket: bucket, Key: key}});
    s3obj.upload({Body: intentRequest.intent.slots.AddNew.value}).
      on('httpUploadProgress', function(evt) { console.log(evt); }).
      send(function(err, data) { 
          console.log(err, data) 
          callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput2, repromptText, shouldEndSession));
      });
    
    // callback(sessionAttributes, buildSpeechletResponse(cardTitle, speechOutput2, repromptText, shouldEndSession));
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
    
    var repromptText = "something about chores";
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

    var speechOutput1 = "<p>Welcome to screen time.</p> <p>Say configure to edit chores</p>"
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
