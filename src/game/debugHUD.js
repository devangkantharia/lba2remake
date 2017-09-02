import {map, each, filter, find} from 'lodash';

let debugBox = null;
let debugContent = null;
let debugInput = null;
let debugDataList = null;
let debugSlots = [];
let debugValues = {};
let enabled = false;
let availableLabels = new Set();

export function initDebugHUD() {
    debugBox = document.getElementById('debugBox');
    debugContent = document.querySelector('#debugBox .content');
    debugInput = document.querySelector('#debugBox .selector input');
    debugDataList = document.querySelector('#debugBox .selector datalist');
    document.querySelector('#debugBox .selector button').onclick = validateInput;
    debugInput.onkeydown = event => {
        const key = event.code || event.which || event.keyCode;
        if (key === 'Enter' || key === 13) {
            validateInput();
        }
        event.stopPropagation();
    };
    debugInput.onkeyup = event => {
        event.stopPropagation();
    };
    refreshSelector();
}

export function startDebugHUDFrame() {
    debugValues = {};
}

export function endDebugHUDFrame() {
    if (enabled) {
        each(debugSlots, slot => {
            if (slot.label in debugValues) {
                slot.title.style.color = 'white';
                slot.content.innerHTML = debugValues[slot.label];
            } else {
                slot.title.style.color = 'darkgrey';
                slot.content.innerHTML = '<span style="color:darkgrey;font-style:italic;">N/A</span>';
            }
        });
    }
}

export function switchHUD() {
    enabled = !enabled;
    console.log('Switching debug HUD: ', enabled ? 'ON' : 'OFF');
    debugBox.style.display = enabled ? 'block' : 'none';
}

export function refreshSlots() {
    while (debugContent.hasChildNodes()) {
        debugContent.removeChild(debugContent.lastChild);
    }
    each(debugSlots, slot => {
        if (!slot.element) {
            const button = document.createElement('button');
            const content = document.createElement('span');
            const title = document.createElement('span');
            title.innerText = ` ${slot.label}: `;
            button.style.color = 'black';
            button.style.background = 'white';
            button.innerText = '-';
            slot.element = document.createElement('div');
            slot.element.appendChild(button);
            slot.element.appendChild(title);
            slot.element.appendChild(content);
            slot.content = content;
            slot.title = title;
            button.onclick = () => {
                const idx = debugSlots.indexOf(slot);
                debugSlots.splice(idx, 1);
                refreshSlots();
            }
        }
        debugContent.appendChild(slot.element);
    });
    refreshSelector();
}

export function refreshSelector() {
    debugDataList.innerHTML = map(
        filter([...availableLabels], label => !find(debugSlots, slot => slot.label === label)),
        label => `<option>${label}</option>`).join('');
}

function validateInput() {
    if (debugInput.value) {
        if (!find(debugSlots, slot => slot.label === debugInput.value)) {
            debugSlots.push({label: debugInput.value});
            debugInput.value = '';
            refreshSlots();
        }
    }
}

function debugValue(label, value) {
    if (enabled) {
        if (!availableLabels.has(label)) {
            availableLabels.add(label);
            refreshSelector();
        }
        debugValues[label] = value();
    }
}

export function debugVector(label, vec) {
    debugValue(label, () => {
        const components = map(vec.toArray(), (n, i) => `<span style="color:${['red', 'lime', 'lightskyblue'][i]};">${n.toFixed(3)}</span>`);
        return components.join(', ');
    });
}