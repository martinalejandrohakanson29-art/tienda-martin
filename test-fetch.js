const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7Pa9ql-kdfGt_kQReLGEzFGaqVcex55VydptBQhV2EI0DTLhXFvzxukPbtZ6YCiprd8D7HKF80sWL/pub?gid=0&single=true&output=csv";
fetch(url, { cache: "no-store" })
  .then(res => res.text())
  .then(text => console.log("Success, length:", text.length))
  .catch(err => console.error("Error:", err.message));
