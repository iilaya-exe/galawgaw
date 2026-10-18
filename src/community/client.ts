import { API } from '../online/api';
export type Guest={id:string;name:string;token:string};
export function communityGuest():Guest|null{
  try{const g=JSON.parse(sessionStorage.getItem('galawgaw.guest')||'null');if(!g?.token)return null;const payload=JSON.parse(atob(g.token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return payload.exp*1000>Date.now()?g:null;}catch{return null;}
}
export const mediaUrl=(path:string)=>`${API}/api${path}`;
export async function request<T>(path:string,options:{method?:string;body?:unknown;file?:File;signal?:AbortSignal;blob?:boolean}={}):Promise<T>{
  if(!API)throw new Error('Community highlights are not connected yet.');
  const guest=communityGuest();
  const response=await fetch(mediaUrl('/community'+path),{method:options.method||'GET',signal:options.signal||AbortSignal.timeout(options.file?90000:20000),headers:{...(guest?{Authorization:`Bearer ${guest.token}`} :{}),...(options.file?{'Content-Type':options.file.type.split(';')[0]}:options.body?{'Content-Type':'application/json'}:{})},body:options.file|| (options.body?JSON.stringify(options.body):undefined)});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'Could not complete that request. Please retry.');}
  return (options.blob?response.blob():response.json()) as Promise<T>;
}
export type Moment={id:string;caption:string;creator:string;game:string;createdAt:string;thumbnail:string;featured:boolean;comments:number;laughs:number};
export type Submission=Moment&{status:string;consented:boolean;remaining:number;preview:boolean;error:string|null};
export type Page<T>={items:T[];next:string|null};
export type CommunityConfig={enabled:boolean;maxBytes:number;maxSeconds:number};
export function playOnly(video:HTMLVideoElement){document.querySelectorAll<HTMLVideoElement>('video[data-social-video]').forEach(other=>{if(other!==video)other.pause();});}
