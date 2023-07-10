import {Stream,Profile} from "../fitscripts/src/index.js";
import {MyDecoder} from "/scripts/mydecoder.js";
import * as FH from "/scripts/fileholder.js";
import * as Edits from "/scripts/edits.js";

//init behavior
let uploadButton = document.querySelector("#open-button");
let fileElem = document.querySelector("[data-role='file-selector']");
const reader = new FileReader();

let stream = undefined;
let decoder = undefined;

let allBytes;

//display elements
const gridContainer = document.querySelector("[data-role='grid-container']");
const detailsContainer = document.querySelector("[data-role='details-container']");
const primaryInputContainer = document.querySelector("[data-role='input']");
const appContainer = document.querySelector("#app-container");
const sidebarLeft = document.querySelector("[data-role='sidebar-left']");
const editContainer = document.querySelector("[data-role='edit-container']");

const activeMesgs = {};

//0.2s is css transition time for detail card
let CARD_TRANSITION_TIME = 250; 

/**
 * Decodes user's FIT file into objects to be used for display and
 * interaction.
 */
function readerLoadHandler() {

    //TODO display 'working' animated overlay
    stream = Stream.fromArrayBuffer(reader.result);
    decoder = new MyDecoder(stream);
    
    if (decoder.isFIT() == false) {
        console.log('not a valid fit file');
        //TODO what happens with header error?
    }
    
    //want unknown data parsed even if it has no profile
    let output = decoder.read({includeUnknownData:true});
    
    if (output.errors.length == 0){
        //no problems yet, display to user
    } else {
        //partial or no decoding, display what you have and offer a lookahead for fixing

    }

    //store for easier access; NB if error, allbytes stops at error not EOF
    allBytes = decoder.allBytes;
    
    //not using objects (yet) so for now this sets module-level var elsewhere 
    //to keep function parameter lists from getting long
    FH.setLocalDefinitions(decoder.localMessageDefinitions);
    primaryInputContainer.remove();
        
    const fileDisplay = FH.displayFile(allBytes);
    gridContainer.append(fileDisplay);
    
    appContainer.classList.remove('hidden');
};

/**
 * Loads user-selected file into memory.
 */
function fileUploadHandler() {
    //TODO error if >1 file selected?
    
    let file = fileElem.files[0];
    reader.readAsArrayBuffer(file);
   
    //TODO catch errors and display to user
};

/**
 * Triggers display of the clicked message in the detail panel, showing the
 * bit-level details for that message.
 */
function gridClickHandler(e) {
    const target = e.target;
    
    //only message grid elements have data-type attribute
    const type = target.dataset?.type;
        
    if (type == undefined || type == null)
        return;

    //const type = target.dataset.type;
    const mesgIdx = target.dataset.index;
    const obj = allBytes[mesgIdx];
    
    //TODO error handling of some sort
    if(!obj)
        return;
    
    //don't double-display the same message
    if(activeMesgs.hasOwnProperty(mesgIdx))
        return;
    
    const detailsFragment = FH.displayDetailCard(mesgIdx, type, obj, reader.result);
    
    //TODO error handling of some sort
    if(detailsFragment === null)
        return;
    
    activeMesgs[mesgIdx] = target;
    target.classList.add('active-byte');
    
    detailsContainer.append(detailsFragment);
};

/**
 * Removes the clicked details card from the display and un-highlights its
 * associated file-grid block.
 */
function detailsCloseHandler(e) {
    const target = e.target;
    const button = e.target.closest('button');
    const role = button?.dataset?.role;
    const card = e.target.closest("[data-role='details-card']");
    
    if(role !== 'close' || card === null)
        return;

    const mesgIdx = card.dataset?.index;
    const mesgEl = activeMesgs[mesgIdx];
    
    card.classList.add('closing');    

    //use this to remove instead of a transitionend handler (for max-height
    //transition) so if user disables them, removal will still occur
    setTimeout(() => {
    
        card.remove();
        mesgEl?.classList.remove('active-byte');
        delete activeMesgs[mesgIdx];
        
    }, CARD_TRANSITION_TIME);
};

/**
 * Delegates click on sidebar to either displaying the details of a message
 * or toggling the display of the entire sidebar element.
 */
function sidebarClickHandler(e) {

    //only message grid elements have data-type attribute
    const typecheck = e.target?.dataset?.type;
        
    if (typecheck !== undefined || typecheck !== null)
        gridClickHandler(e);
    
    const button = e.target.closest('button');
    
    if (button?.dataset?.role === 'sidebar-toggle'){
        //TODO add check in case user has altered state manually?
        sidebarLeft.classList.toggle('closed');
        detailsContainer.classList.toggle('fullscreen');      
    }
};

/**
 * Handles the user's input for cutting bytes from the file
 */
function editHandler(e) {
    
    const role = e.target.closest("button")?.dataset?.role;
    
    if (role !== 'submit-cut')
        return;
    
    const idx_start = editContainer.querySelector("#cut-start-input")?.valueAsNumber;
    const idx_end = editContainer.querySelector("#cut-end-input")?.valueAsNumber;
    
    //TODO separate validation function w/ type/empty/ordinality checks, etc.
    const valid = (idx_start !== null) && (idx_start !== undefined)
                  && (idx_end !== null) && (idx_end !== undefined);
    
    if (!valid)
        return;
    
    let arr = Edits.clipBytes(stream, idx_start, idx_end);
    Edits.updateFileHeader(arr);    
    Edits.updateFileCRC(arr);  
    
    stream = Stream.fromArrayBuffer(arr.buffer);
};

/**
 * Enable ctrl-s to save .fit file 
 * TODO this is just a temp convenience method that needs a UI element
 */
function keyboardHandler(e) {
    if(e.ctrlKey && e.key === 's') {
        e.preventDefault();
        
        //TODO SDK stream object makes everything take extra steps; use buffer direct
        const arr = new Uint8Array(stream.slice(0,stream.length));
        const blob = new Blob([arr], {type:'application/octet-stream'});        
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fitfile.fit';
        document.body.appendChild(a);
        a.style = 'display: none';
        a.click();
        a.remove();
    }
};


//window.showDirectoryPicker might be useful? Enables writing
fileElem.addEventListener('change', fileUploadHandler);
reader.addEventListener('load', readerLoadHandler);
sidebarLeft.addEventListener('click', sidebarClickHandler);
detailsContainer.addEventListener('click', detailsCloseHandler);
editContainer.addEventListener('click', editHandler);
document.addEventListener('keydown', keyboardHandler);
