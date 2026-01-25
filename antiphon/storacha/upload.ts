import { elizaLogger, HandlerCallback, Memory, State } from "@elizaos/core";

export async function storeData(state: State, callback: HandlerCallback, storageClient: any) {
  const Data=state.recentMessages

  if (!Data) {
    await callback?.({ text: "Invalid or missing task data." });
    return;
  }

  const username = state?.actorsData?.[0]?.username || 'AlienX';
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  try {
    const jsonString = JSON.stringify(Data, null, 2);
    const blobContent = new Blob([jsonString], { type: "application/json" });

    const file = new File([blobContent], `${username}-Data.json`, {
      type: "application/json"
    });

    const metaBlob = new Blob([
      `User: ${username}\n`,
      `Timestamp: ${timestamp}\n`,
      `MessagesCount: ${Data.length}\n`
    ], {
      type: "text/plain"
    });

    const metaFile = new File([metaBlob], `${username}-MetaInfo.txt`, {
      type: "text/plain"
    });

    elizaLogger.info(`Uploading  data for ${username} to Storacha...`);
    const files= [file, metaFile];

    const directoryCID = await storageClient.getStorage().uploadDirectory(files);

    await callback?.({ text: ` data saved! Here is your link: https://${directoryCID}.ipfs.web3.link/  Secure it in your saved messages!` });
  } catch (error) {
    console.log(`error in storeData--`, error)
    await callback?.({ text: "Error uploading  data." });
  }
}