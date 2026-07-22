const TARGET_WIDTH = 1030;
const TARGET_HEIGHT = 590;

const REGIONS = {
  productCode: {
    x1: 280,
    x2: 440,
    y1: 45,
    y2: 130
  },

  sensor1: {
    x1: 310,
    x2: 540,
    y1: 180,
    y2: 320
  },

  sensor2: {
    x1: 720,
    x2: 950,
    y1: 180,
    y2: 320
  },

  sensor3: {
    x1: 310,
    x2: 540,
    y1: 400,
    y2: 550
  },

  sensor4: {
    x1: 720,
    x2: 950,
    y1: 400,
    y2: 550
  }
};


export async function processImage(file){

  return new Promise((resolve)=>{

    const img=new Image();

    img.onload=async()=>{

      try{

        const canvas=document.createElement("canvas");
        canvas.width=img.width;
        canvas.height=img.height;

        const ctx=canvas.getContext("2d");
        ctx.drawImage(img,0,0);


        let rect=detectScreen(ctx,img.width,img.height);


        if(!rect){
          rect=getCenterRect(img.width,img.height);
        }


        const dst=[
          {x:0,y:0},
          {x:TARGET_WIDTH,y:0},
          {x:TARGET_WIDTH,y:TARGET_HEIGHT},
          {x:0,y:TARGET_HEIGHT}
        ];


        const M=getPerspectiveTransform(
          rect,
          dst
        );


        const output=document.createElement("canvas");
        output.width=TARGET_WIDTH;
        output.height=TARGET_HEIGHT;


        const outCtx=output.getContext("2d");

        outCtx.imageSmoothingEnabled=false;


        perspectiveWarp(
          outCtx,
          img,
          M,
          TARGET_WIDTH,
          TARGET_HEIGHT
        );


        const result=
          recognizeLCD(outCtx);


        resolve(result);


      }catch(e){

        console.error(e);

        resolve({
          success:false,
          error:e.message
        });

      }

    };


    img.onerror=()=>{

      resolve({
        success:false,
        error:"图片读取失败"
      });

    };


    img.src=URL.createObjectURL(file);

  });

}


function detectScreen(ctx,w,h){

  const data=
    ctx.getImageData(0,0,w,h).data;


  let minX=w;
  let minY=h;
  let maxX=0;
  let maxY=0;


  for(let y=0;y<h;y++){

    for(let x=0;x<w;x++){

      const i=(y*w+x)*4;

      const r=data[i];
      const g=data[i+1];
      const b=data[i+2];


      if(
        b>80 &&
        b>r*1.2 &&
        b>g*1.1
      ){

        minX=Math.min(minX,x);
        maxX=Math.max(maxX,x);
        minY=Math.min(minY,y);
        maxY=Math.max(maxY,y);

      }

    }

  }


  if(
    maxX-minX<100 ||
    maxY-minY<100
  ){
    return null;
  }


  return [
    {x:minX,y:minY},
    {x:maxX,y:minY},
    {x:maxX,y:maxY},
    {x:minX,y:maxY}
  ];

}


function getCenterRect(w,h){

  const ratio=
    TARGET_WIDTH/TARGET_HEIGHT;


  let rw,rh;


  if(w/h>ratio){

    rh=h*0.9;
    rw=rh*ratio;

  }else{

    rw=w*0.9;
    rh=rw/ratio;

  }


  const x=(w-rw)/2;
  const y=(h-rh)/2;


  return [

    {
      x,
      y
    },

    {
      x:x+rw,
      y
    },

    {
      x:x+rw,
      y:y+rh
    },

    {
      x,
      y:y+rh
    }

  ];

}

function recognizeLCD(ctx){

  const weights=[];


  for(const key of [
    "sensor1",
    "sensor2",
    "sensor3",
    "sensor4"
  ]){

    const value=
      recognizeNumberArea(
        ctx,
        REGIONS[key]
      );

    weights.push(value);

  }


  const validWeights = weights.filter(v => !isNaN(v));
  const avgWeight = validWeights.length > 0
    ? validWeights.reduce((a, b) => a + b, 0) / validWeights.length
    : 0;


  const cog =
    calculateCOG(weights);


  const productCode =
    recognizeProductCode(ctx);


  return {

    success:true,

    w1:weights[0],
    w2:weights[1],
    w3:weights[2],
    w4:weights[3],

    weights,

    avgWeight:
      Number(avgWeight.toFixed(2)),

    cog,

    productCode

  };

}


function recognizeNumberArea(ctx,region){

  const img=
    cropRegion(
      ctx,
      region
    );


  const binary=
    createLCDBinary(
      img
    );


  const chars=
    splitCharacters(
      binary
    );


  let result="";


  for(const c of chars){

    result+=
      matchLCDCharacter(c);

  }


  result=
    result.replace(
      /[^0-9.]/g,
      ""
    );


  if(result.length===0){
    return NaN;
  }


  let value=parseFloat(result);


  if(
    isNaN(value)
  ){
    return NaN;
  }


  return value;

}


function cropRegion(ctx,r){

  const canvas=
    document.createElement("canvas");


  const w=r.x2-r.x1;
  const h=r.y2-r.y1;


  canvas.width=w;
  canvas.height=h;


  const c=
    canvas.getContext("2d");


  c.drawImage(
    ctx.canvas,
    r.x1,
    r.y1,
    w,
    h,
    0,
    0,
    w,
    h
  );


  return canvas;

}


function createLCDBinary(canvas){

  const scale=3;


  const out=
    document.createElement("canvas");


  out.width=
    canvas.width*scale;

  out.height=
    canvas.height*scale;


  const ctx=
    out.getContext("2d");


  ctx.imageSmoothingEnabled=false;


  ctx.drawImage(
    canvas,
    0,
    0,
    out.width,
    out.height
  );


  const img=
    ctx.getImageData(
      0,
      0,
      out.width,
      out.height
    );


  const d=img.data;


  for(
    let i=0;
    i<d.length;
    i+=4
  ){

    const gray=
      0.299*d[i]+
      0.587*d[i+1]+
      0.114*d[i+2];


    if(gray>150){

      d[i]=255;
      d[i+1]=255;
      d[i+2]=255;

    }else{

      d[i]=0;
      d[i+1]=0;
      d[i+2]=0;

    }


  }


  ctx.putImageData(
    img,
    0,
    0
  );


  return out;

}


function splitCharacters(canvas){


  const ctx=
    canvas.getContext("2d");


  const img=
    ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );


  const d=img.data;


  const cols=[];


  for(
    let x=0;
    x<canvas.width;
    x++
  ){

    let count=0;


    for(
      let y=0;
      y<canvas.height;
      y++
    ){

      const i=
        (y*canvas.width+x)*4;


      if(
        d[i]>200
      ){
        count++;
      }

    }


    cols.push(count);

  }


  const ranges=[];

  let start=-1;


  for(
    let i=0;
    i<cols.length;
    i++
  ){

    if(
      cols[i]>2
    ){

      if(start<0)
        start=i;

    }else{

      if(start>=0){

        if(i-start>3){

          ranges.push([
            start,
            i
          ]);

        }

        start=-1;

      }

    }

  }


  return ranges.map(r=>{

    const c=
      document.createElement("canvas");


    c.width=
      r[1]-r[0];

    c.height=
      canvas.height;


    c.getContext("2d")
     .drawImage(
        canvas,
        r[0],
        0,
        c.width,
        c.height,
        0,
        0,
        c.width,
        c.height
     );


    return c;

  });

}

function matchLCDCharacter(canvas){


  const pattern =
    extractCharacterPattern(canvas);


  const templates = {


    "0":[
      "111",
      "101",
      "101",
      "101",
      "111"
    ],


    "1":[
      "010",
      "110",
      "010",
      "010",
      "111"
    ],


    "2":[
      "111",
      "001",
      "111",
      "100",
      "111"
    ],


    "3":[
      "111",
      "001",
      "111",
      "001",
      "111"
    ],


    "4":[
      "101",
      "101",
      "111",
      "001",
      "001"
    ],


    "5":[
      "111",
      "100",
      "111",
      "001",
      "111"
    ],


    "6":[
      "111",
      "100",
      "111",
      "101",
      "111"
    ],


    "7":[
      "111",
      "001",
      "001",
      "001",
      "001"
    ],


    "8":[
      "111",
      "101",
      "111",
      "101",
      "111"
    ],


    "9":[
      "111",
      "101",
      "111",
      "001",
      "111"
    ],


    ".":[
      "0",
      "0",
      "0",
      "0",
      "1"
    ]

  };


  let best="";

  let score=999999;


  for(
    const key in templates
  ){

    const s=
      comparePattern(
        pattern,
        templates[key]
      );


    if(s<score){

      score=s;
      best=key;

    }

  }


  return best;

}


function extractCharacterPattern(canvas){


  const ctx=
    canvas.getContext("2d");


  const small=
    document.createElement("canvas");


  small.width=3;
  small.height=5;


  const sctx=
    small.getContext("2d");


  sctx.drawImage(
    canvas,
    0,
    0,
    3,
    5
  );


  const img=
    sctx.getImageData(
      0,
      0,
      3,
      5
    );


  const result=[];


  for(let y=0;y<5;y++){

    let row="";


    for(let x=0;x<3;x++){

      const i=
        (y*3+x)*4;


      row +=
        img.data[i]>120
        ?"1"
        :"0";

    }


    result.push(row);

  }


  return result;

}


function comparePattern(a,b){


  let diff=0;


  for(
    let y=0;
    y<a.length;
    y++
  ){

    for(
      let x=0;
      x<a[y].length;
      x++
    ){

      if(
        a[y][x]!==b[y][x]
      ){

        diff++;

      }

    }

  }


  return diff;

}


function recognizeProductCode(ctx){


  const region=
    REGIONS.productCode;


  const canvas=
    cropRegion(
      ctx,
      region
    );


  const binary=
    createLCDBinary(
      canvas
    );


  const chars=
    splitCharacters(
      binary
    );


  let code="";


  for(
    const c of chars
  ){

    code +=
      matchLCDCharacter(c);

  }


  if(code.length===0){

    return "";

  }


  return code;

}


function calculateCOG(weights){


  const valid=
    weights.filter(
      v=>!isNaN(v)
    );


  if(
    valid.length===0
  ){

    return {
      x:0,
      y:0
    };

  }


  const positions=[

    {
      x:0,
      y:0
    },

    {
      x:100,
      y:0
    },

    {
      x:0,
      y:100
    },

    {
      x:100,
      y:100
    }

  ];


  let sx=0;
  let sy=0;
  let total=0;


  weights.forEach(
    (w,i)=>{

      if(
        !isNaN(w)
      ){

        sx +=
          positions[i].x*w;

        sy +=
          positions[i].y*w;


        total += w;

      }

    }
  );


  if(total===0){

    return {
      x:0,
      y:0
    };

  }


  return {

    x:
      Number(
        (sx/total)
        .toFixed(2)
      ),

    y:
      Number(
        (sy/total)
        .toFixed(2)
      )

  };

}


function getPerspectiveTransform(src,dst){

  return {
    src,
    dst
  };

}


function perspectiveWarp(
  ctx,
  img,
  matrix,
  w,
  h
){

  ctx.drawImage(
    img,
    0,
    0,
    w,
    h
  );

}


export default {
  processImage
};