import { lazy, Suspense, useEffect, useRef, useState } from 'react';

const Feed=lazy(()=>import('./Community').then(m=>({default:m.CommunityFeed})));
const Publish=lazy(()=>import('./Community').then(m=>({default:m.PublishForm})));
// Mounted only in menus. Defer the community bundle and requests until the section is near view.
export function CommunityGate(){
  const ref=useRef<HTMLElement>(null),[visible,setVisible]=useState(false);
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'120px'});if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
  return <section id="moments" ref={ref} aria-label="Funniest Moments">{visible?<Suspense fallback={<p>Opening Funniest Moments…</p>}><Feed/></Suspense>:<p className="arcade-caption">FUNNIEST MOMENTS / FROM THE COMMUNITY</p>}</section>;
}
export function PublishHighlight(props:{gameId?:string;file?:File;url:string;matchId?:string;onOpen?:()=>void}){
  const [open,setOpen]=useState(false);
  return <><button type="button" onClick={()=>{props.onOpen?.();document.querySelectorAll<HTMLVideoElement>('video[data-social-video]').forEach(v=>v.pause());setOpen(true);}}>Submit to Funniest Moments ↗</button>{open&&<Suspense fallback={<p>Opening submission…</p>}><Publish {...props} onClose={()=>setOpen(false)}/></Suspense>}</>;
}
