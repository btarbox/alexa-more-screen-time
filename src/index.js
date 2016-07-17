/**
 * This sample demonstrates a simple skill built with the Amazon Alexa Skills Kit.
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

// Route the incoming request based on type (LaunchRequest, IntentRequest, etc.) 
// The JSON body of the request is provided in the event parameter.
exports.handler = function (event, context) {
    try {
        console.log("event.session.application.applicationId=" + event.session.application.applicationId);
        console.log("event.session.user.userId=" + event.session.user.userId);  /* ID of the user making the request */
        // getChoreList(context)
        
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

function getChoreList(context, callback) {
    const bucket = "lambdaeventsource";
    const key = "MoreScreenTime/DefaultChores.txt";
    const params = {
        Bucket: bucket,
        Key: key
    };
    console.log("about to get s3 object with chore list");
    s3.getObject(params, function(err, data) {
        if (err) {
            console.log("not found " + err);
            context.fail(message);
        } else {
            console.log('found file ', data.ContentType);
            var body = data.Body.toString('ascii');
            console.log("file contents: " + body);
            // var str = "123, 124, 234,252";
            var chorelist = body.split(",");
            // var arr = body.split(",").map(function (val) { return +val + 1; });
            console.log("split chores into array (hopefully) " + chorelist);
            console.log("There are " + chorelist.length + " chores: " + chorelist[0] + ";" + chorelist[1] + ";");
            MAX_CHORE = chorelist.length;
            // context.succeed(data.ContentType); // call this if function is called within another function?
            console.log("about to call getWelcomeResponse with callback");
            getWelcomeResponse(callback, chorelist);  // Dispatch to the skill's launch.
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

    getChoreList(context, callback);
    // getWelcomeResponse(callback);  // Dispatch to your skill's launch.
}

/**
 * Called when the user specifies an intent for this skill.
 */
function onIntent(intentRequest, session, callback) {
    console.log("onIntent requestId=" + intentRequest.requestId + ", sessionId=" + session.sessionId);

    var intent = intentRequest.intent,intentName = intentRequest.intent.name;
    console.log("got intent " + intentName);
    
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
        getWelcomeResponse(callback);
    } else if ("AMAZON.StopIntent" === intentName || "AMAZON.CancelIntent" === intentName) {
        handleSessionEndRequest(callback);
    } else {
        throw "Invalid intent";
    }
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
function onSessionEnded(sessionEndedRequest, session) {
    console.log("onSessionEnded requestId=" + sessionEndedRequest.requestId + ", sessionId=" + session.sessionId);
    // Add cleanup logic here
}

// --------------- Functions that control the skill's behavior -----------------------

function getWelcomeResponse(callback, chorelist) {
    // If we wanted to initialize the session to have some attributes we could add those here.
    console.log("at getWelcomeResponse with " + chorelist.length + " chores.");
    var sessionAttributes = {};
    sessionAttributes.chorelist = chorelist;
    console.log("assigned chorelist parameter to sessionAttributes");
    
    var cardTitle = "Welcome";
    var speechOutput1 = "<p>Welcome to screen time.</p>  Have you " + chorelist[0]; 
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
    var speechOutput = "Thank you for trying the Alexa Skills Kit sample. Have a nice day!";
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
        sessionAttributes.choreCounter = 1;
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
    var speechOutput2 = "<speak>" + speechOutput + "</speak>";
    var shouldEndSession = false;
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
    console.log("here");
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
        speechOutput = "<p>Yes,</p> you may have more screen time";
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
