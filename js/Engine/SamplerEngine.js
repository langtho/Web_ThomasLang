// SamplerEngine.js

// Import the playback utility function (assumed to handle connecting buffer to speaker)
import { playSound } from './soundutils.js';
// Import the class that holds sample metadata (name, URL, buffer)
import { SoundSample } from './SoundSample.js';

// The main class for audio processing and sample management
export default class SamplerEngine {
    
    // Constructor initializes the AudioContext and event handlers
    constructor(opts = {}) {
        // Create or use an existing AudioContext
        this.ctx = opts.audioContext || new AudioContext();
        this.samples = []; // Array to hold SoundSample objects
        this.currentSample = null; // The currently selected sample for editing/viewing

        this.recorder =null;
        this.lastBlob =null;
        this.lastRecordedBuffer =null;
        this.RecordingStream =null;
        this.isRecording = false;

        // Define placeholder functions for external callbacks (used by SamplerGUI)
        this.onSampleReady = opts.onSampleReady || (() => {});
        this.onSampleError = opts.onSampleError || (() => {});
        this.onSampleSelect = opts.onSampleSelect || (() => {});
        this.onProgress = opts.onProgress || (() => {});
        this.onStatus= opts.onStatus || (() => {});
        this.onError= opts.onError || (() => {});

        //Recording callbacks
        this.onRecordingStart = opts.onRecordingStart || (() => {});
        this.onRecordingStop = opts.onRecordingStop || (() => {});
        this.onNewSampleReady = opts.onNewSampleReady || (() => {});
    }

    // Ensures the AudioContext is running (required by browser policies)
    async ensureAudioContextRunning() {
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume(); // Resume if suspended
        }
        return this.ctx;
    }


    // Sets up the list of samples to be loaded based on file data
    initializeSamples(fileData) {
        this.samples = []; // Clear old samples
        this.currentSample = null;
        
        // Create a SoundSample instance for each file
        fileData.forEach(file => {
            if (!file || !file.fullURL) {
                console.warn("Skipping sample due to incomplete data:", file);
                return;
            }
            const sampleName = file.name // Use the provided name
            const sample = new SoundSample(sampleName, file.fullURL);
            this.samples.push(sample);
        });
    }

    
    // Asynchronously loads, monitors progress, and decodes an audio file from a URL
    async loadAndDecodeSoundStream(url, ctx, sample, onProgress, onStatus, onError) {
    onStatus(sample, { phase: "connect", message: "Connecting…" });

    try {
        const response = await fetch(url);
        // Check for non-200 status codes or missing body
        if (!response.ok || !response.body) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Get total file size from response header, if available
        const total = Number(response.headers.get("content-length") || 0) || null;
        
        const reader = response.body.getReader(); // Get a reader to handle the stream
        const chunks = [];
        let recv = 0; // Bytes received

        
        // Loop to read data chunks until finished
        while (true) {
            const { done, value } = await reader.read();
            if (done) break; // Exit loop when stream is complete
            
            chunks.push(value);
            recv += value.length;
           
            onProgress(sample, recv, total); // Call callback to update GUI progress bar
        }

        
        // Combine chunks into a single binary Blob
        const blob = new Blob(chunks, { type: response.headers.get("content-type") || "application/octet-stream" });
        // Decode the raw binary data into a Web Audio Buffer
        const soundBuffer = await ctx.decodeAudioData(await blob.arrayBuffer());

        onStatus(sample, { phase: "ready", message: "Ready" }); 
        
        return soundBuffer;

    } catch (e) {
        onError(sample, e);
        onStatus(sample, { phase: "error", message: String(e.message || e) });
        return null; // Return null on error
    }
}


    // Initiates the loading and decoding process for all samples
    async loadAllSamples() {
     
        // Create an array of Promises, one for each sample load operation
        const loadPromises = this.samples.map(sample => {
            if (!sample.url) return Promise.resolve();
            
            return this.loadAndDecodeSoundStream(
            sample.url, 
            this.ctx, 
            sample, 
            this.onProgress, // Pass all necessary callbacks
            this.onStatus,   
            this.onError     
        ).then(soundData => {
            if (soundData) {
                sample.buffer = soundData; // Store the decoded buffer
                this.onSampleReady(sample); // Notify GUI the sample is ready
            }
        });
        });

        await Promise.all(loadPromises); // Wait for all samples to finish loading

        // Automatically select the first successfully loaded sample
        if (!this.currentSample) {
            const firstSample = this.samples.find(s => s.buffer);
            if (firstSample) {
                this.selectSample(firstSample);
            }
        }
    }

    // Triggers playback for a given sample
    playSample(sample) {
        // Ensure the sample exists and has a decoded buffer
        if (!sample || !sample.buffer) return;
        // Use utility function to handle the playback node creation/connection
        playSound(this.ctx, sample.buffer, sample.trimStart, sample.trimEnd);
    }

    // Sets the currently selected sample (for GUI/editor focus)
    selectSample(sample) {
        if (this.currentSample === sample) return; // Ignore if already selected
        
        this.currentSample = sample;
        this.onSampleSelect(sample); // Notify GUI of the change
    }

    // Forces the selection event to fire (useful if local changes happened)
    forceUpdateCurrentSample() {
        if (this.currentSample) {
            this.onSampleSelect(this.currentSample); 
        }
    }
    
    // --- Getters ---
    getCurrentSample() {
        return this.currentSample;
    }

    getSamples() {
        return this.samples;
    }

    // New recording methods

    async initrecorder(){
        if(this.recorder) return true;

        try{
            this.RecordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.recorder = new MediaRecorder(this.RecordingStream);
            
            this.recorder.addEventListener('dataavailable', this.onRecordingReady.bind(this));
            console.log("Recorder initialized");
            return true;
        }catch(e){
            this.onError(null, e);
            this.onError(null, new Error("Access denied"));
           return false;
        }
    }

    startRecording(){
        if(!this.recorder||this.recorder.state === 'recording') return;
        this.lastBlob = null;
        this.lastRecordedBuffer = null;
        this.recorder.start();
        this.isRecording = true;
        this.onRecordingStart();
        console.log("Recording started");
    }

    stopRecording(){
        if(!this.recorder||this.recorder.state !== 'recording') return;
        this.recorder.stop();
        this.isRecording = false;
        this.onRecordingStop();
        console.log("Recording stopped");
    }

    async onRecordingReady(event){
        this.lastBlob = event.data;
        if(!this.lastBlob||this.lastBlob.size === 0) {
            console.warn("No data recorded");
            return;
        }
        this.onStatus(null, { phase: "decoding", message: "Decoding recorded audio…" });
        
        try{
            const arrayBuffer = await this.lastBlob.arrayBuffer();
            const decoded = await this.ctx.decodeAudioData(arrayBuffer);
            this.lastRecordedBuffer = decoded;
            this.onStatus(null, { phase: "ready", message: "Recorded audio ready" });
            this.onNewSampleReady();
            console.log("Recording ready");
        }catch(e){
            this.onError(null, e);
            this.onStatus(null, { phase: "error", message: String(e.message || e) });
        }   
    }

    playRecordedSample(){
        if(!this.lastRecordedBuffer) return;
        playSound(this.ctx, this.lastRecordedBuffer,0,this.lastRecordedBuffer.duration);
    }

    addRecordedSample(samplerName="Custom Rec"){
        if(!this.lastRecordedBuffer){
            this.onError(null, new Error("No recorded sample available"));
            return false;
        }

        const newSample = new SoundSample(samplerName, null);
        newSample.buffer = this.lastRecordedBuffer;
        newSample.trimStart =0;
        newSample.trimEnd = this.lastRecordedBuffer.duration;
        const padIndex = this.samples.findIndex(s=>!s.buffer);
        const MAX_PADS =16;

        if(padIndex !== -1){
            this.samples[padIndex] = newSample;
        }else if(this.samples.length < MAX_PADS){
            this.samples.push(newSample);
        }else{
            const targetIndex = this.currentSample ? this.samples.findIndex(s=>s===this.currentSample) : this.samples.length -1;
            this.samples[targetIndex] = newSample;
        }
        this.onSampleReady(newSample);
        this.selectSample(newSample);
        return true;
    }
}