import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  const scriptCode = `
    window.cvReady = false;
    function onOpenCvReady() {
      window.cvReady = true;
      console.log('OpenCV.js loaded successfully');
    }
  `;

  return (
    <Html lang="zh-CN">
      <Head>
        <meta charSet="utf-8" />
        <title>重心重量计算系统</title>
        <script async src="https://docs.opencv.org/4.8.0/opencv.js" onLoad="onOpenCvReady()" type="text/javascript"></script>
      </Head>
      <body>
        <Main />
        <NextScript />
        <script type="text/javascript" dangerouslySetInnerHTML={{ __html: scriptCode }} />
      </body>
    </Html>
  );
}