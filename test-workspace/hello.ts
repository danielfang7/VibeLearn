// Test workspace for VibeLearn extension development host
// The extension loads from the parent project; this folder is just a workspace to open.

async function fetchData(url: string): Promise<void> {
  const response = await fetch(url);
  const data = await response.json();
  console.log(data);
}
