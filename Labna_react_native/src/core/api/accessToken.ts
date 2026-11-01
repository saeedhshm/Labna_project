let accessToken : string | null = null;

//set access token in memory
export function setAccessToken(token:string | null){
    accessToken = token;
}
// get access token from memory
export function getAccessToken(){
    return accessToken
}

// clear access token from memory
export function clearAccessToken(){
    accessToken = null;
}