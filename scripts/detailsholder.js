const ARROWR_URL = '/images/arrow_wrap_left.svg';
const ARROWL_URL = '/images/arrow_wrap_right.svg';
const CLOSE_X_STR = `M607.5 205.5l-178.5 178.5 178.5 178.5-45 
                     45-178.5-178.5-178.5 178.5-45-45 
                     178.5-178.5-178.5-178.5 45-45 178.5 178.5 178.5-178.5z`;
                     
const BITBLOCK_WIDTH = 75;

//Strings used for display in detail cards
const detailsDisplayStrings = {
    'header text' : {'data' : 'DATA MESSAGE',
                     'definition' : 'DEFINITION MESSAGE',
                     'error' : 'ERROR AND UNPARSED DATA',
                     'unknown' : 'UNKNOWN MESSAGE',
                     'fileheader' : 'FILE HEADER'},
                     
    'header class' : {'data' : 'data-header',
                      'definition' : 'definition-header',
                      'error' : 'error-header',
                      'unknown' : 'unknown-header',
                      'fileheader' : 'fileheader-header'},
};

function createByteBlock(block){
    const wrap = document.createElement('div');
    const maxwidth = block.bitStrings.length * BITBLOCK_WIDTH;
    wrap.classList = 'byteblock-new';
    wrap.setAttribute("style", `max-width: ${maxwidth}px`);
    
    const bitsWrap = document.createElement('div');
    const spanopen = "<span class='bitblock-new'>";
    const spanjoin = block.bitStrings.join(`</span>${spanopen}`);

    bitsWrap.classList = 'bits-container-new';
    bitsWrap.innerHTML = spanopen + spanjoin + "</span>";

    const divider = document.createElement('div');
    divider.classList = 'byteblock-divider';
    
    const labelWrap = document.createElement('div');
    labelWrap.classList = 'byteblock-label-new';
    labelWrap.innerText = block.details;
    //labelWrap.setAttribute("style", `max-width: ${maxwidth}px`);
   
    wrap.append(bitsWrap);
    wrap.append(divider);
    wrap.append(labelWrap);
    
    return wrap;
};

function createByteRow(rowObj) {

    const rowContainer = document.createElement('div');
    
    //step one, create first cap
    const capL = document.createElement('div');
    capL.classList = 'row-cap';
        
    if(rowObj[0]['leftcap'] === 'open'){
        const iconL = document.createElement('img');
        iconL.setAttribute('src', ARROWL_URL);
        iconL.classList = 'wraparrow wraparrow-left';
        capL.append(iconL);
    }
    
    //step two, create middle section
    const center = document.createElement('div');
    center.classList = 'row-center';
    
    const bytesContainer = document.createElement('div');
    bytesContainer.classList = 'bytes-container';
    
    rowObj.forEach(function(block,blockIdx){
        const byteBlock = createByteBlock(block);
        bytesContainer.append(byteBlock);  
    });
    
    center.append(bytesContainer);
    
    const divider = document.createElement('div');
    divider.classList = 'row-divider';
    //don't add to center block yet; need to know if row wraps to next one
        
    //step three, second/end cap
    const capR = document.createElement('div');
    capR.classList = 'row-cap';
        
    if(rowObj[rowObj.length-1]['rightcap'] === 'open'){
        const iconR = document.createElement('img');
        iconR.setAttribute('src', ARROWR_URL);
        iconR.classList = 'wraparrow wraparrow-right';
        capR.append(iconR);
        divider.classList += ' divider-wrap';
    }
    
    center.append(divider);
    
    //add them all 
    rowContainer.append(capL, center, capR);
    
    return rowContainer;
};

/**
 * Creates the DOM objects used to display a bit-level breakdown
 * of messages. Bytes are grouped logically as outlined in the _map
 * object parameter, and may be split if a single group of connected
 * bytes extends past the end of a row.
 */ 
export function createByteStack(rowObjs) {

    const bitblockContainer = document.createElement('div');
    bitblockContainer.classList = 'bitblocks-container';
    
    rowObjs.forEach(function(row, rowIdx){
        const rowContainer = createByteRow(row);
        rowContainer.classList = 'bytegrid-row';
        bitblockContainer.append(rowContainer);
    });

    return bitblockContainer;
};

export function createDetailsHeader(mesgType, mesgSubtype, is_named) {
    //unnamed/non-profile mesg have default "names" provided by the decoder
    //but aren't differentiated from one another for display

    //TODO this whole thing smells, clean up/refactor
    
    const container = document.createElement('div');
    const _typestring = is_named === false ? 
                                     `unnamed-${mesgType}` : 
                                     mesgType;
    
    container.classList = 'details-header ' + _typestring + '-header';

    const contentWrap = document.createElement('div');
    contentWrap.classList = 'details-header-content';
    
    const title = document.createElement('p');
    
    //TODO if type missing, wat do? Log Error? Throw error? Default value?
    title.innerText = detailsDisplayStrings['header text'][mesgType];
    title.classList = 'details-titletext';
    
    contentWrap.append(title);
    
    //definitions have a subtype to display, data mesgs have an assoc'd definition
    //all others lack secondary info
    
    if(mesgSubtype !== null & mesgSubtype !== undefined) {
        title.classList.add('small');
        
        const subtitle = document.createElement('p');
        subtitle.innerText = mesgSubtype;
        subtitle.classList = 'details-titletext large';   
        
        contentWrap.append(subtitle);
    }
    
    const iconWrap = document.createElement('div');
    iconWrap.classList = 'close-button-wrapper';
    iconWrap.append(closeButton());
    
    container.append(contentWrap);
    container.append(iconWrap);
    
    return container;
};

/**
 * Helper func to create 'X' style close button and icon
 */
function closeButton() {

    const button = document.createElement('button');
    button.classList = 'details-close-button';
    button.setAttribute('type', 'button');
    button.setAttribute('data-role', 'close');
    
    const svg = document.createElementNS("http://www.w3.org/2000/svg", 'svg');
    svg.setAttribute('viewBox', '0 0 768 768');
    svg.classList = 'close-icon';
       
    svg.innerHTML = `<path fill="currentColor" d="${CLOSE_X_STR}"></path>`;
    
    button.append(svg);
                  
    return button;
};

export function createMesgGrid(mesgArr, rowlength, inclNums=true) {
    
    const grid = document.createElement('div');
    grid.classList = 'message-grid-wrapper';
    
    mesgArr.forEach(function(mesg, idx) {
        //TODO this feels uglier than necessary
        const _type = (mesg.has_profile || mesg.type === 'fileheader' || mesg.type === 'error') ? 
                       mesg.type : 
                       `unnamed-${mesg.type}`;
                       
        const bar = document.createElement('div');
        bar.classList = `message-bar ${_type}-colorbar`;
        bar.title = `Message ${idx}: ${_type}`;
        bar.dataset.index = idx;
        bar.dataset.type = mesg.type; //TODO use? Needs to include named vs unnamed
        
        grid.append(bar);
    });
    
    const wrap = document.createElement('div');
    wrap.classList = 'message-grid-container';
    
    //wrap.append(rowLabels);
    wrap.append(grid);
    
    return wrap;
};
