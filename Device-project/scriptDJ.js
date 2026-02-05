(() => {


function setup() {
  setInterval(() => fetchText('logDJ.json'), 5000);
  fetchText('logDJ.json'); 
}

function fetchText(log) {
  let params = {
    mode: 'cors',
    cache: 'no-store', 
    headers: {
      'accept': 'text/json'
    }
  };

  fetch(log, params)
    .then(response => response.text())
    .then(data => getResponse(data))
    .catch(error => console.log(error));
}

function getResponse(data) {

  let lines = data
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) return;


  let lastLine = lines[lines.length - 1];

  try {
    let obj = JSON.parse(lastLine);


    const tempEl = document.getElementById('temp3');
    const humidEl = document.getElementById('humid3');
    const feltEl = document.getElementById('felt3');

    if (tempEl && obj.temperature !== undefined) {
      tempEl.textContent = Number(obj.temperature).toFixed(0);
    }
    if (feltEl && obj.felt !== undefined) {
      feltEl.textContent = Number(obj.felt).toFixed(0);
      let mappedValue = (Number(obj.felt) - 10) / (30 - 10);

      mappedValue = Math.max(0, Math.min(1, mappedValue));
      document.documentElement.style.setProperty('--felt3-num', mappedValue);
    }
    if (humidEl && obj.humidity !== undefined) {
      humidEl.textContent = Number(obj.humidity).toFixed(0);
    }
  } catch (e) {
   
    if (lines.length >= 2) {
      try {
        let obj2 = JSON.parse(lines[lines.length - 2]);

        const tempEl = document.getElementById('temp3');
        const humidEl = document.getElementById('humid3');
        const feltEl = document.getElementById('felt3');

        if (tempEl && obj2.temperature !== undefined) {
          tempEl.textContent = Number(obj2.temperature).toFixed(0);
        }
        if (feltEl && obj2.felt !== undefined) {
          feltEl.textContent = Number(obj2.felt).toFixed(0);
        }
        if (humidEl && obj2.humidity !== undefined) {
          humidEl.textContent = Number(obj2.humidity).toFixed(0);
        }
      } catch (e2) {
       
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', setup);


})();