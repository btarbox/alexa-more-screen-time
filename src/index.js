/**
 * This sample demonstrates a simple skill built with the Amazon Alexa Skills Kit.
 * The Intent Schema, Custom Slots, and Sample Utterances for this skill, as well as
 * testing instructions are located at https://github.com/btarbox/alexa-more-screen-time
 *
 * For additional samples, visit the Alexa Skills Kit Getting Started guide at
 * http://amzn.to/1LGWsLG
 */

var chores = ["done homework", "gotten dressed", "fed the animals", "taken out the garbage", "eaten breakfast", "packed lunch"];
//var asks = ["have you done homework?", "have you gotten dressed?", "have you fed the animals", "have you taken out the garbage", "have you eaten breakfast", "have you packed lunch"];
var MAX_CHORE = chores.length;
var aws = require('aws-sdk');
var s3 = new aws.S3({ apiVersion: '2006-03-01' });

// Route the incoming request based on type (LaunchRequest, IntentRequest, etc.) The JSON body of the request is provided in the event parameter.
exports.handler = function (event, context) {
    try {
        console.log("event.session.application.applicationId=" + event.session.application.applicationId);
        console.log("event.session.user.userId=" + event.session.user.userId)  /* ID of the user making the request */
        const bucket = "lambdaeventsource"
        const key = "MoreScreenTime/DefaultChores.txt"
        const params = {
         Bucket: bucket,
            Key: key
        };
        console.log("about to get s3 object with chore list")
        s3.getObject(params, function(err, data) {
            if (err) {
                console.log("not found " + err)
                context.fail(message);
            } else {
                console.log('found file ', data.ContentType)
                var body = data.Body.toString('ascii')
                console.log("body: " + body)
                context.succeed(data.ContentType);
            }
        })
        Sleep(2)
        console.log("past the s3 stuff")
        
        if (event.session.application.applicationId !== "amzn1.echo-sdk-ams.app.068e04ab-9c69-4da2-9b0b-018333c82a48") {
             context.fail("Invalid Application ID");
        }

        if (event.session.new) {
            onSessionStarted({requestId: event.request.requestId}, event.session);
        }

        if (event.request.type === "LaunchRequest") {
            onLaunch(event.request,
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

/**
 * Called when the session starts.
 */
function onSessionStarted(sessionStartedRequest, session) {
    console.log("onSessionStarted requestId=" + sessionStartedRequest.requestId + ", sessionId=" + session.sessionId);
}

/**
 * Called when the user launches the skill without specifying what they want.
 */
function onLaunch(launchRequest, session, callback) {
    console.log("onLaunch requestId=" + launchRequest.requestId + ", sessionId=" + session.sessionId);

    // Dispatch to your skill's launch.
    getWelcomeResponse(callback);
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

function getWelcomeResponse(callback) {
    // If we wanted to initialize the session to have some attributes we could add those here.
    var sessionAttributes = {};
    var cardTitle = "Welcome";
    var speechOutput = "Welcome to screen time. Have you " + chores[0];
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
    speechOutput = "You have not completed all your chores so you may not have more screen time  ";
    speechOutput += "You have ";
    for(var i=1; i < sessionAttributes.choreCounter; i++) {
        speechOutput += chores[i] + " ";
    }
    speechOutput += "  but you have not ";
    for(i=sessionAttributes.choreCounter; i < MAX_CHORE; i++) {
        speechOutput += chores[i] + " ";
    }
    var shouldEndSession = false;
    callback(sessionAttributes,
         buildSpeechletResponse("Request Denied", speechOutput, "goodbye", shouldEndSession));
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
       speechOutput = "have you " + chores[sessionAttributes.choreCounter];
       sessionAttributes.choreCounter += 1;
    } else {
        speechOutput = "Yes, you may have more screen time";
        shouldEndSession = true
    }
    repromptText = "bla";

    callback(sessionAttributes,
         buildSpeechletResponse(cardTitle, speechOutput, repromptText, shouldEndSession));
}


// --------------- Helpers that build all of the responses -----------------------

function buildSpeechletResponse(title, output, repromptText, shouldEndSession) {
    return {
        outputSpeech: {
            type: "PlainText",
            text: output
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
