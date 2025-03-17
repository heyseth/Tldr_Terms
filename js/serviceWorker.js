chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Store HTML content per tab
const tabContent = new Map();

chrome.runtime.onMessage.addListener(
  async function(request, sender, sendResponse) {

    if (request.type === "server") {
      const server = new Server();
      const result = await server.sendTermsToServer(request.message);
      
      // Don't store the result yet - let ButtonInserter process it first
      chrome.tabs.sendMessage(sender.tab.id, {type: "result", message: result }, () => {});

    } else if (request.type === "main") {
      // Store the processed HTML content for this tab
      if (sender.tab && sender.tab.id) {
        tabContent.set(sender.tab.id, request.message);
      }
    } else if (request.type === "openpanel") {
      await chrome.sidePanel.open({ tabId: sender.tab.id });
      await chrome.sidePanel.setOptions({
        tabId: sender.tab.id,
        path: 'sidepanel.html',
        enabled: true
      });
    } else if (request.type === "getTabContent") {
      // Return stored HTML content for the tab
      const content = tabContent.get(request.tabId) || '';
      sendResponse({content});
      return true;
    }
    return true; // Required to use sendResponse asynchronously
  }
);

// Clean up stored content when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabContent.delete(tabId);
});

class Server {
  metaprompt = 
  `You are an assistant that summarizes Terms and Conditions into plain language. Read the provided text and extract its key points, including:

  Concerning Elements: anything which the user may find concerning.
  Purpose & Scope: What the document covers.
  User Obligations: Responsibilities and limitations.
  Privacy & Data Usage: How data is collected and used.
  Liabilities & Disclaimers: Key limitations and warranties.
  Dispute Resolution: Methods for resolving conflicts.
  The summary should have 3 concise bullet points for each section above, using simple language and avoiding legal jargon. Each bullet point must end with a short sentence from the text that supports the claim. This sentence MUST match the text exactly. Put the sentence between square brackets []`;

async sendTermsToServer(prompt) {

  const urlsToTry = [
    "http://ec2-3-17-81-212.us-east-2.compute.amazonaws.com:5000/api"
  ];

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: this.metaprompt + prompt,
                },
              ],
            },
          ],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.log("Error: " + (data.error || "Failed to get response"));
        return;
      }

      const response = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!response) {
        console.log("Invalid response format");
        return;
      }

      return response;
    } catch (err) {
      console.log("Error: " + err.message);
    }
  }
}
}