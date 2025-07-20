// popup.js
function sendToContent(action) {
    chrome.tabs.query({active: true, currentWindow: true}, tabs => {
      if (tabs.length === 0) return;
      chrome.tabs.sendMessage(tabs[0].id, {action});
    });
  }
  
  document.getElementById('startBtn').onclick = () => {
    sendToContent("start");
    loadAndDisplayEvents();
  };
  
  document.getElementById('stopBtn').onclick = () => {
    sendToContent("stop");
    loadAndDisplayEvents();
  };
  
  document.getElementById('clearBtn').onclick = () => {
    sendToContent("clear");
    document.getElementById('eventsList').innerHTML = '';
  };
  
  document.getElementById('downloadBtn').onclick = () => {
    chrome.storage.local.get({ navigationEvents: [] }, (res) => {
      const blob = new Blob([JSON.stringify(res.navigationEvents, null, 2)], {type: "application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "navigation_events.json";
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); }, 500);
    });
  };
  
  function loadAndDisplayEvents() {
    chrome.storage.local.get({ navigationEvents: [] }, (res) => {
      const list = document.getElementById('eventsList');
      list.innerHTML = '';
      res.navigationEvents.slice(-200).reverse().forEach(ev => {
        const li = document.createElement('li');
        li.textContent = `[${ev.timestamp.split('T')[1].slice(0,8)}] ${ev.eventType}: ${ev.additionalContext?.text||ev.additionalContext?.message||''} (${ev.url.split('//')[1]||''})`;
        list.appendChild(li);
      });
    });
  }
  
  // Initial load
  loadAndDisplayEvents();