import * as Keychain from 'react-native-keychain'

const AUTH_TOKEN_SERVICE = 'com.labna.auth.refresh-token';
const USER_NAME = 'labna_customer';
 
// set refresh token in keychain
export async function saveRefreshToken(token:string):Promise<void>{
    await Keychain.setGenericPassword(
        USER_NAME,
        token,
        {
            server:AUTH_TOKEN_SERVICE
        }
    )
}

// get refresh token from keychain
export async function getRefreshToken(): Promise<string | null> {
    const cridentials = await Keychain.getGenericPassword({
        server:AUTH_TOKEN_SERVICE
    })

    const refreshToken = cridentials ? cridentials.password : null

    return refreshToken
}

// remove refresh token from keychain
export async function removeRefreshToken():Promise<void>{
    await Keychain.resetGenericPassword({
        server:AUTH_TOKEN_SERVICE
    })
}