(function undefined() {
   "use strict";
   
   var debug = true;
   
   
   // These will be initialized later
   var root = this;
   var recognizer, recorder, callbackManager, audioContext;
   // Only when both recorder and recognizer do we have a ready application
   var readyCallback = false;
   var listenCallback = false;
   var hypCallback = false;
   var wordlist;
   
   var state = {
      init: false,
      recorder: {
         initialized: false,
         isConsuming: false
      },
      recognizer: {
         defined: false,
         initialized: false,
         isConsumed: false,
         hasWords: false,
         hasGrammar: false
      },
      annsphinx: {
         ready: false,
         listening: false,
         grammarEnd: false,
         lastHyp: false,
         confidence: 0,
         minConfidence: 1
      }
   }
   
   var spawnWorker = function (workerURL, callback) {
      if (debug) console.log('Spawning new worker');
      recognizer = new Worker(workerURL);
      state.recognizer.defined = true;
      recognizer.onmessage = function(event) {
         callback(recognizer);
      };
      
      recognizer.postMessage('');
   }
   
   var initRecognizer = function(data) {
      if (debug) console.log('Initializing recognizer');
      postRecognizerJob({command: 'initialize', data: data}, function() {
         if (recorder) {
            recorder.consumers = [recognizer];
            state.recognizer.isConsumed = true;
            state.recorder.isConsuming = true;
            if (debug) console.log('Recognizer consumed');
         }
         
         if (debug) console.log('Recognizer loaded');
         state.recognizer.initialized = true;
         if (state.recognizer.hasWords !== false && state.recognizer.hasWords !== true) annsphinx.addWords(state.recognizer.hasWords);
         if (state.recognizer.hasGrammar !== false && state.recognizer.hasGrammar !== true) annsphinx.addGrammar(state.recognizer.hasGrammar);
         
         checkReady();
      });
   }
   
   var makeReady = function () {
      isReady = true;
   }
   
   var recognizerReady = function () {
      for (var i in state.recognizer) {
         if (state.recognizer[i] !== true) return false;
      }
      
      return true;
   }
   
   var recorderReady = function () {
      for (var i in state.recorder) {
         if (state.recorder[i] !== true) return false;
      }
      
      return true;
   }   
   
   var checkReady = function () {
      if (recognizerReady() == true && recorderReady() == true) {
         if (!state.annsphinx.ready) {
            if (debug) console.log('Annsphinx is loaded and ready.');
            state.annsphinx.ready = true;
            if (readyCallback) readyCallback();
         }
      } else {
         if (recognizerReady() != true && debug) console.log('Annsphinx waiting on recognizer');
         if (recorderReady() != true && debug) console.log('Annsphinx waiting on recorder');
      }
   }
   
   var startUserMedia = function (stream) {
      var input = audioContext.createMediaStreamSource(stream);
      // Firefox hack https://support.mozilla.org/en-US/questions/984179
      window.firefox_audio_hack = input; 
      var audioRecorderConfig = {errorCallback: function(x) {console.log("** Error from recorder: " + x);}}; // Status change
      recorder = new AudioRecorder(input, audioRecorderConfig);
      state.recorder.initialized = true;
      
      // If a recognizer is ready, we pass it to the recorder
      if (recognizer && !state.recognizer.isConsumed) {
         recorder.consumers = [recognizer];
         state.recognizer.isConsumed = true;
         state.recorder.isConsuming = true;
         if (debug) console.log('Recognizer consumed');
      }
      
      if (debug) console.log('Recorder initialized');
      checkReady();
   }
   
   var postRecognizerJob = function (message, callback) {
      var msg = message || {};
      if (callbackManager) {
         msg.callbackId = callbackManager.add(callback);
      }
      
      if (recognizer) {
         recognizer.postMessage(msg);
      }
   }
   
   root.annsphinx = {
   
      init: function(data, notify) {
         var recognizerData = data || {};
         callbackManager = new CallbackManager();
         spawnWorker("js/recognizer.js", function(worker) {
            
            // This is the onmessage function, once the worker is fully loaded
            worker.onmessage = function(e) {
               if (debug) console.log(e);
               // This is the case when we have a callback id to be called
               if (e.data.hasOwnProperty('id')) {
                  var clb = callbackManager.get(e.data['id']);
                  var data = {};
                  
                  if (e.data.hasOwnProperty('data')) {   // If there are parameters of the callback
                     data = e.data.data;                 // Add them
                  }

                  if(clb) {                         // If the callback exists
                     clb(data);                     // call it with its data.
                  }
               }
                  
                  // This is a case when the recognizer has a new hypothesis
               if (e.data.hasOwnProperty('hyp')) {
                  var newHyp = e.data.hyp;
                  if (e.data.hasOwnProperty('final') &&  e.data.final) {      // If the data is Final
                     // Do nothing for now.
                  }
                  
                  // do something with the hypothesis
                  if (hypCallback) {
                     if (state.annsphinx.lastHyp = newHyp) {
                        state.annsphinx.confidence++;
                     } else {
                        state.annsphinx.lastHyp = newHyp;
                        state.annsphinx.confidence = 0;
                     }
                     
                     if (state.annsphinx.confidence = state.annsphinx.minConfidence) {
                        hypCallback(newHyp);
                     }
                     
                  } else {
                    if (debug) console.log(newHyp);
                  }
               }
               // This is the case when we have an error
               if (e.data.hasOwnProperty('status') && (e.data.status == "error")) {
                  console.log("** Error in " + e.data.command + " with code " + JSON.stringify(e.data.code));
               }
            },            
            // Once the worker is fully loaded, we can call the initialize function
            initRecognizer(recognizerData);
         });
         
         try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
            window.URL = window.URL || window.webkitURL;
            audioContext = new AudioContext();
            if (notify) notify({success: 1});
            
         } catch (e) {
            if (notify) notify({error: 'Error initializing audio in browser'});
            if (debug) console.log('Recorder Error: Error initializing audio in browser');
         }

         if (navigator.getUserMedia) {
            navigator.getUserMedia({audio: true}, startUserMedia, function(e) {
               if (notify) notify({error: 'No input available'});
               if (debug) console.log('Recorder Error: No input available');
            });
            
         } else {
            if (notify) notify({error: 'Live audio not supported in this browser'});
            if (debug) console.log('Recorder Error: Live audio not supported in this browser');
         }
         
         return this;
      },
      
      requireConfidence: function (minimum) {
         if (minimum > 0 && minimum < 10) {
            state.annsphinx.minConfidence = minimum;
         } else {
            if (debug) console.log('Specified confidence out of range');
         }
         
         return this;
      },
      
      addListenCallback: function (callback) {
         if (callback) listenCallback = callback;
         if (debug) console.log('Listen Callback added');
         return this;
      },
      
      addHypCallback: function (callback) {
         if (callback) hypCallback = callback;
         if (debug) console.log('Hypothesis Callback added');
         return this;
      },
      
      addConsumer: function (consumer) {
         if (recognizerReady && recorderReady) recorder.consumers = [consumer];
         return this;
      },
      
      start: function(callback) {
         if (recorder && recorder.start()) {
            state.annsphinx.listening = true;
            if (listenCallback) listenCallback(true);
            if (callback) callback();
         } else {
            console.log(recorder);
         }
         
         return this;
      },
      
      stop: function (callback) {
         if (recorder) {
            recorder.stop()
            state.annsphinx.listening = false;
            if (listenCallback) listenCallback(false);
            if (callback) callback();
         } else {
            console.log(recorder);
         }
         return this;
      },
      
      addWords: function (words, append, callback) {
         if (append) {
            wordlist = wordlist.concat(words);
         } else {
            wordlist = words;
         }
         
         if (state.recognizer.initialized == true) {
            postRecognizerJob({command: 'addWords', data: wordlist}, function () {
               state.recognizer.hasWords = true;
               checkReady();
               if (debug) console.log('words added');
            });
            
            if (callback) callback();
         } else {
         
            state.recognizer.hasWords = wordlist;
            if (debug) console.log('words queued');
            if (callback) callback();
         }
         
         return this;
      },
      
      addGrammar: function (grammar, callback) {
         if (state.recognizer.initialized == true) {
            postRecognizerJob({command: 'addGrammar', data: grammar}, function () {
               state.recognizer.hasGrammar = true;
               checkReady();
               if (debug) console.log('grammar added');
            });
            
            state.annsphinx.grammarEnd = grammar["end"];

            if (callback) callback()
         } else {
         
            state.recognizer.hasGrammar = grammar;
            if (debug) console.log('grammar queued');
            if (callback) callback();
         }
         return this;
      },
      
      onReady: function (callback) {
         if (state.annsphinx.ready) {
            callback();
         } else {
            readyCallback = callback;
         }
         
         return this;
      }
   };
}).call(this);
