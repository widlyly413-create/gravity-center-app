import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  const cvInitScript = `
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
        <script type="text/javascript" dangerouslySetInnerHTML={{ __html: cvInitScript }} />
        <script async src="/opencv.js" onLoad="onOpenCvReady()" type="text/javascript"></script>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}