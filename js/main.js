// Import the core audio processing class
import SamplerEngine from './Engine/SamplerEngine.js';
// Import the user interface handling class
import SamplerGUI from './GUI/SamplerGUI.js';


// Run initialization code once the page is fully loaded
window.onload = async function init() {

    // Define and gather all required DOM elements
    const opts = {
        canvas: document.querySelector('#myCanvas'),
        canvasOverlay: document.querySelector('#myCanvasOverlay'),
        $buttoncontainer: document.querySelector('#buttonContainer'),
        $presetSelect: document.querySelector('#presetSelect'),
        $loadKitButton: document.querySelector('#loadKitButton'),
        $appTitle: document.querySelector('#app-title'),

        $recordButton : document.querySelector('#recordButton'),
        $stopButton : document.querySelector('#stopButton'),
        $playRecordedButton : document.querySelector('#playRecordedButton'),
        $addRecordedButton : document.querySelector('#addRecordedButton'),
        $recordStatus : document.querySelector('#recordStatus')
    };

    // Check if any necessary elements are missing
    if (Object.values(opts).some(el => el === null)) {
        console.error("One or more required DOM elements are missing.");
        return;
    }

    // Initialize the audio engine and the GUI
    const samplerEngine = new SamplerEngine();
    const samplerGUI = new SamplerGUI(samplerEngine, opts);

    // Add click listener to start the Web Audio Context (browser requirement)
    this.document.addEventListener('click', () => {
        samplerEngine.ensureAudioContextRunning();
    });

    // Fetch and display the list of sound presets
    await samplerGUI.fetchPresets(opts.$presetSelect,opts);

    // Set up the event listener for the "Load Kit" button
    opts.$loadKitButton.addEventListener('click', () => {
        samplerGUI.handlePresetSelection(samplerEngine, opts);
    });

};