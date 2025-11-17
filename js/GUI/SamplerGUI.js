// Import the component responsible for editing the waveform display
import WaveformEditor from './WaveformEditor.js';

// Constants for API access and audio file path
const API_URL = 'http://localhost:3000/api/presets';
const AUDIO_BASE_PATH = 'http://localhost:3000/presets/';
// Array to store all fetched preset data
let allPresetsData = [];

// The main class handling the Sampler's User Interface (GUI)
export default class SamplerGUI {
    
    
    // Constructor initializes the GUI properties and components
    constructor(engine, opts) {
        this.engine = engine; // Reference to the SamplerEngine (audio logic)
        
        // References to main sample pad and preset selection elements
        this.$buttoncontainer = opts.$buttoncontainer;
        this.$presetSelect = opts.$presetSelect;
        
        // References to MIDI interface elements
        this.$midiEnableBtn =document.querySelector("#midiEnableBtn");
        this.$midiInputSel =document.querySelector("#midiInput");
        this.$midiStatus =document.querySelector("#midiStatus");

        //Recording controls
        this.$recordButton = opts.$recordButton;
        this.$stopButton = opts.$stopButton;
        this.$playRecordedButton = opts.$playRecordedButton;
        this.$addRecordedButton = opts.$addRecordedButton;
        this.$recordStatus = opts.$recordStatus;

        // Internal MIDI state variables
        this.midiAccess =null;
        this.currenMidiInput=null;
        this.BASE_NOTE=36; // C2, the lowest MIDI note mapped to pad 1

        // Initialize the WaveformEditor component
        this.editor = new WaveformEditor(opts.canvas, opts.canvasOverlay, this.engine.playSample.bind(this.engine));
        
        // Set up custom event handlers from the SamplerEngine
        this.setupEngineCallbacks();
        // Set up MIDI button and dropdown listeners
        this.setupMidiListeners();

        //Setup recording listener
        this.setupRecordingListeners();
    }

    // Connects functions in the GUI to custom events fired by the Engine
    setupEngineCallbacks() {
        // Called when a sample finishes loading successfully
        this.engine.onSampleReady = (sample) => {
            const button = document.getElementById(`pad-button-${sample.name}`);
            if (button) {
                const label= button.querySelector('span');
                if(label){
                    label.innerText = sample.name; // Update text
                }
                button.classList.remove('loading-pad');
                button.classList.add('ready-pad');
                button.disabled = false; // Enable the pad button
            }
        };

        // Called if a sample fails to load
        this.engine.onSampleError = (sample, error) => {
            const button = document.getElementById(`pad-button-${sample.name}`);
            if (button) {
                button.disabled = true; 
                button.textContent = `Error: ${sample.name}`;
                button.classList.add('error-pad');
            }
        };

        // Called when a sample is selected (e.g., to view its waveform)
        this.engine.onSampleSelect = (sample) => {this.editor.selectSample(sample);};
        
        // Called repeatedly while a sample is downloading to update the progress bar
        this.engine.onProgress = (sample, received, total) => {
            const els = this.padElements.get(sample.name);
            console.log(`Progress debug for ${sample.name}:`, {
                foundElements: els,
                buttonHTML: els?.button?.innerHTML,
                progExists: els?.prog instanceof HTMLElement,
                barExists: els?.bar instanceof HTMLElement
            });

            if (!els || !els.bar) {
                console.warn(`Missing elements for ${sample.name}`);
                return;
            }

            // Calculate percentage based on total size, or use a logarithmic fallback
            let pct;
            if (total && total > 0) {
                pct = Math.max(0, Math.min(100, Math.floor((received / total) * 100)));
            } else {
                // Fallback for when total size isn't known yet
                pct = Math.min(95, Math.floor(Math.log10((received || 0) * 25)));
            }
            
            const finalPct =Math.max(1,pct); // Ensure minimum 1% width
            console.log(finalPct)
            
            els.bar.style.width=`${finalPct}%`; // Update the visual progress bar width

            // Debugging progress bar dimensions
            const computed = getComputedStyle(els.bar);
            console.log(`Progress ${sample.name}: ${pct}%`, {
                pct,
                inlineWidth: els.bar.style.width,
                computedWidth: computed.width,
                computedDisplay: computed.display,
                computedPosition: computed.position,
                barRect: els.bar.getBoundingClientRect()
            });
        };

        this.engine.onRecordingStart = () => {
            this.setRecordControlsState(true,false);
            this.$recordStatus.textContent ="Recording...";
        };
        
        this.engine.onRecordingStop = () => {
            this.setRecordControlsState(false,false);
            this.$recordStatus.textContent ="Process Recording...";
        };

        this.engine.onNewSampleReady = (buffer) => {
            this.setRecordControlsState(false,true);
            this.$recordStatus.textContent ="Recording ready";
        };

        this.engine.onStatus = (sample, status) => {
            if(!sample) {
                this.$recordStatus.textContent = `${status.message}`;
            }
        };

        this.engine.onError = (sample, error) => {
            if(!sample) {
                this.$recordStatus.textContent = `Error: ${error.message || error}`;
            }
        };
    }
    
    // Dynamically creates and renders the 16 sample pad buttons
    renderSampleButtons(samples) {
        this.$buttoncontainer.innerHTML = ''; // Clear existing buttons
        
        const engine = this.engine;
        const PAD_COUNT = 16;
        
        // Map samples by name for quick lookup during click handling
        const samplesByName = new Map();
        samples.forEach(sample => samplesByName.set(sample.name, sample));
        
        this.padElements=new Map(); // Stores references to progress bar elements per sample

        // Loop to create 16 pad elements
        for (let i = 0; i < PAD_COUNT; i++) {
            const sample = samples[i]; 

            const button = document.createElement('button');
            
            // Set unique ID for the button
           const padID = sample 
                ? `pad-button-${sample.name}`
                : `pad-placeholder-${i}`; 

            button.id = padID;

            if (sample) {
                // Create content (label, progress bar) for valid samples
                const contentDiv = document.createElement('div');
                contentDiv.classList.add('pad-content');

                const label = document.createElement('span');
                label.innerText = sample.name + (sample.buffer ? '' : ' (Loading...)');
                contentDiv.appendChild(label); 

                button.appendChild(contentDiv); 
                
                // Create progress bar structure
                const progDiv = document.createElement('div');
                progDiv.classList.add('prog');
                
                const barDiv = document.createElement('div');
                barDiv.classList.add('bar');
                
                progDiv.appendChild(barDiv);
                button.appendChild(progDiv);

                button.classList.add('sample-pad', 'loading-pad');

                // Debug: Log created elements
                console.log(`Created elements for ${sample.name}:`, {
                    button,
                    prog: progDiv,
                    bar: barDiv,
                    html: button.innerHTML
                });

                // Store references to the button elements for progress updates
                this.padElements.set(sample.name, {
                    button,
                    prog: progDiv,
                    bar: barDiv
                });
            } else {
                // Handle pads beyond the number of available samples
                button.innerText = `Pad ${i + 1} (Empty)`;
                button.disabled = true;
                button.classList.add('empty-pad');
            }

            this.$buttoncontainer.appendChild(button);
        }

        // Add a single delegated click listener to the container
        this.$buttoncontainer.addEventListener('click', (event) => {
            // Find the closest button element that was clicked
            const button = event.target.closest('BUTTON');
            if (!button || button.disabled || !button.classList.contains('sample-pad')) {
                return; // Ignore if not a valid, enabled sample button
            }

            const sampleName = button.id.replace('pad-button-', '');
            
            const clickedSample = samplesByName.get(sampleName);

            if (clickedSample && clickedSample.buffer) {
                console.log("Button clicked for sample (delegated):", clickedSample.name);

                const currentSample = engine.getCurrentSample(); 
                
                if (currentSample === clickedSample) {
                    // If the sample is already selected, play it
                } else {
                    // Otherwise, select the sample (to view waveform) and play it
                    engine.selectSample(clickedSample);
                }
                
                engine.playSample(clickedSample);
            }
        });
    }


    // Fetches the list of available preset kits from the API
    async  fetchPresets($presetSelect,  opts) {

    try {
        const response = await fetch(API_URL);
        allPresetsData = await response.json(); // Store the data globally

        $presetSelect.innerHTML = '';
        // Add a default "Select" option
        let first_option = document.createElement('option');
        first_option.value = '';
        first_option.textContent = '-- Select a preset kit --';
        $presetSelect.appendChild(first_option);
        opts.$appTitle.textContent = "Beatpad - Kits loaded";

        if (allPresetsData.length === 0) {
            $presetSelect.innerHTML = '<option value="">No presets available</option>';
            return;
        }

        // Populate the dropdown with fetched preset names
        allPresetsData.forEach((pre, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = pre.name;
            $presetSelect.appendChild(option);
        });

    } catch (error) {
        console.error("Error fetching presets:", error);
        $presetSelect.innerHTML = '<option value="">Error loading presets</option>';
    }
}

    // Handles the UI and Engine steps when a user selects a kit and clicks 'Load'
    async handlePresetSelection(samplerEngine,  opts) {
    const $presetSelect = document.querySelector('#presetSelect');
    const selectedIndex = $presetSelect.value;
    if (selectedIndex === '') return;

    if (!allPresetsData || !allPresetsData[selectedIndex]) {
        console.error(`Preset data missing for index: ${selectedIndex}. Aborting selection.`);
        return;
    }

    const selectedPreset = allPresetsData[selectedIndex];

    if (opts.$appTitle && selectedPreset.name) {
        opts.$appTitle.textContent = `Beatpad - Loaded Kit: ${selectedPreset.name}`;
    }

    const files = Array.isArray(selectedPreset.samples) ? selectedPreset.samples : [];

    if (files.length === 0) {
        $buttoncontainer.innerHTML = '<p>No samples in this preset.</p>';
        samplerEngine.initializeSamples([]);
        return;
    }


    // Convert relative file paths to full URLs
    const sampleData = files.map(file => {
        const relativeURL = file.url;
        const fullURL = `${AUDIO_BASE_PATH}${relativeURL}`;
        return {
            name: file.name,
            fullURL: fullURL
        };
    });


    // Initialize the engine with the new sample list
    samplerEngine.initializeSamples(sampleData, selectedPreset.name);
    // Render the new set of buttons based on the samples
    this.renderSampleButtons(samplerEngine.getSamples());
    // Wait briefly before starting loading (ensures DOM is updated)
    await new Promise(resolve=> setTimeout(resolve,50));
    this.initLoadingBars(); // Reset progress bars to 0%
    // Tell the engine to begin downloading and decoding all samples
    await samplerEngine.loadAllSamples();
}


// Resets the visual loading bars on all sample pads
initLoadingBars() {
        this.engine.getSamples().forEach(sample => {
            const els = this.padElements.get(sample.name);
            if (els && els.bar) {
                els.bar.style.transition = ''; // Remove transition for immediate reset
                els.bar.style.width = '0%';
            }
        });
    }


// Sets up listeners for the MIDI activation button and input selector
setupMidiListeners(){
    this.$midiEnableBtn.addEventListener("click",async()=>{
        if(!navigator.requestMIDIAccess){
            this.$midiStatus.textContent = "Web MIDI isn't supportet";
            return;
        }
        try{
            // Request access to Web MIDI API
            this.midiAccess = await navigator.requestMIDIAccess();
            this.$midiStatus.textContent="MIDI activated. Choose Input Instrument";
            this.populateInputs(); // Fill the dropdown with available devices
            this.$midiInputSel.disabled=false;
            // Re-run populateInputs if a device is connected/disconnected
            this.midiAccess.onstatechange = this.populateInputs.bind(this);
        }catch(e){
            this.$midiStatus.textContent="MIDI access refused";
            console.error("MIDI access error:",e);
        }
    });
    // Listen for changes in the MIDI input dropdown
    this.$midiInputSel.addEventListener("change", this.bindSelectedMidiInput.bind(this));
}

// Populates the MIDI input selector dropdown with available devices
populateInputs() {
    this.$midiInputSel.innerHTML = "";
    
    if (!this.midiAccess || !this.midiAccess.inputs.size) {
        this.$midiInputSel.innerHTML = "<option>(no input)</option>";
        this.$midiInputSel.disabled = true;
        this.bindSelectedMidiInput(); // Unbind any current input
        return;
    }
    
    // Add an option for each found MIDI input device
    this.midiAccess.inputs.forEach(input => {
        const opt = document.createElement("option");
        opt.value = input.id;
        opt.textContent = input.name || input.id;
        this.$midiInputSel.appendChild(opt);
    });

    this.bindSelectedMidiInput(); // Automatically bind the first or previously selected input
}

// Sets the event handler for the currently selected MIDI input device
bindSelectedMidiInput() {
    // Clear the message handler from the previously selected device
    if (this.currenMidiInput) {
        this.currenMidiInput.onmidimessage = null; 
    }

    const id = this.$midiInputSel.value;
   
    // Find the device corresponding to the selected ID
    const input = Array.from(this.midiAccess?.inputs.values() || []).find(i => i.id === id);

    if (!input) {
        this.$midiStatus.textContent = "Device not found or no device selected.";
        this.currenMidiInput = null;
        return;
    }

    // Assign the main MIDI message handler
    input.onmidimessage = (event) => {
        // MIDI message data: status, note number, velocity
        const [status, note, velocity] = event.data;
        const command = status & 0xF0; // Extract the command type
        
        // Check for 'Note On' command (0x90) with a velocity greater than 0
        if (command === 0x90 && velocity > 0) {
            // Map the incoming MIDI note to a pad index (e.g., C2 (36) maps to pad 0)
            const padIndex = note - this.BASE_NOTE;
            
            const samples = this.engine.getSamples(); 
            
            // Check if the pad index is valid
            if (padIndex >= 0 && padIndex < samples.length) {
                const sampleToPlay = samples[padIndex];
                
                // Only play if the sample is fully loaded (has a buffer)
                if (sampleToPlay.buffer) {
                    this.engine.playSample(sampleToPlay);
                    
                    // Add a quick visual feedback effect to the corresponding pad button
                    const els = this.padElements.get(sampleToPlay.name);
                    if (els) {
                        els.button.classList.add("playing");
                        setTimeout(()=>els.button.classList.remove("playing"), 150);
                    }
                }
            }
        }
    };

    this.currenMidiInput = input;
    this.$midiStatus.textContent = `Connected: ${input.name} `;
}

setRecordControlsState(isRecording,hasRecordedBuffer ){
    if(isRecording){
        this.$recordButton.disabled = true;
        this.$stopButton.disabled = false;
        this.$playRecordedButton.disabled = true;
        this.$addRecordedButton.disabled = true;
    }else{
        this.$recordButton.disabled = false;
        this.$stopButton.disabled = true;

        this.$playRecordedButton.disabled = !hasRecordedBuffer;
        this.$addRecordedButton.disabled = !hasRecordedBuffer;
    }
}

setupRecordingListeners(){
    this.setRecordControlsState(false,false);

    this.$recordButton.addEventListener('click', async () => {
        if (!this.engine.recorder) {
            this.$recordStatus.textContent = "Requesting mic access...";
            const initialized = await this.engine.initrecorder();
            
            if (initialized) {
                this.engine.lastRecordedBuffer = null; // Sicherstellen, dass der Puffer leer ist
                this.setRecordControlsState(false, false);
                this.$recordStatus.textContent = "Ready to record. Click again to start.";
            } else {
                this.setRecordControlsState(false, false);
                this.$recordStatus.textContent = "Microphone access denied.";
            }
            return; 
        }

        if (this.engine.recorder && !this.engine.isRecording) {
            this.engine.startRecording();
        }
    });

    this.$stopButton.addEventListener("click",()=>{
        this.engine.stopRecording();
    });

    this.$playRecordedButton.addEventListener("click",()=>{
        this.engine.playRecordedSample();
    });

    this.$addRecordedButton.addEventListener("click",()=>{
        const sampleName = prompt("Enter a name for the recorded sample:", "Custom Rec");
        if(sampleName){
            const added = this.engine.addRecordedSample(sampleName);
            if(added){
                this.renderSampleButtons(this.engine.getSamples());
                this.engine.lastRecordedBuffer =null;
                this.setRecordControlsState(false,false);
                this.$recordStatus.textContent ="Recorded sample added to pads.";
            }
        }
    });

}



}