package com.example.vmcloud_android_demo;

import android.app.Activity;
import android.media.MediaPlayer;
import android.os.AsyncTask;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.*;
import org.apache.commons.io.IOUtils;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.*;

public class VMCloudDemoActivity extends Activity {
	private MediaPlayer player = new MediaPlayer();
	private TableLayout monitorTable;
	private String controlIP;
	private String controlPort;


	@Override
	public void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		setContentView(R.layout.main);
		findViewById(R.id.go).setOnClickListener(new View.OnClickListener() {
			@Override
			public void onClick(View view) {
				initMonitor();
			}
		});
	}

	private class FetchServerTask extends AsyncTask<Void, Void, String> {
		@Override
		protected void onPostExecute(String result) {
			super.onPostExecute(result);
			try {
				JSONObject object = new JSONObject(result);
				List<JSONObject> vms = new ArrayList<JSONObject>();
				JSONArray arr = object.names();
				if (arr == null) arr = new JSONArray();
				for (int i = 0; i < arr.length(); i++) {
					int index = Integer.parseInt(arr.getString(i));
					JSONObject vm = object.getJSONObject(String.valueOf(index));
					vm.put("id", index);
					vms.add(vm);
				}
				Collections.sort(vms, new Comparator<JSONObject>() {
					@Override
					public int compare(JSONObject a, JSONObject b) {
						try {
							return a.getInt("id") - b.getInt("id");
						} catch (JSONException e) {
							return 0;
						}
					}
				});

				while (monitorTable.getChildCount() > 1) {
					monitorTable.removeViewAt(1);
				}

				for (JSONObject vm : vms) {
					int id = vm.getInt("id");
					int state = vm.getJSONObject("state").getInt("state");
					String stateStr = "CREATING,BOOTING,WAIT,FREE,READY,OCCUPIED,ERROR".split(",")[state];
					String ip = null;
					if (vm.has("server") && vm.getJSONObject("server").has("public_ip")) {
						ip = vm.getJSONObject("server").getString("public_ip");
					}
					TableRow row = (TableRow) getLayoutInflater().inflate(R.layout.vm_row, null);
					((TextView) row.findViewById(R.id.vmid)).setText(String.valueOf(id));
					((TextView) row.findViewById(R.id.vmstate)).setText(stateStr);
					((TextView) row.findViewById(R.id.vmip)).setText(ip == null ? "None" : ip);
					Button listenButton = (Button) row.findViewById(R.id.vmlisten);
					listenButton.setEnabled(ip != null);
					final String finalIp = ip;
					listenButton.setOnClickListener(new View.OnClickListener() {
						@Override
						public void onClick(View view) {
							playAudioFrom(finalIp);
						}
					});
					monitorTable.addView(row);
				}
			} catch (JSONException e) {
				Log.wtf("vmcloud", e);
			}
			monitorTable.postDelayed(new Runnable() {
				@Override
				public void run() {
					new FetchServerTask().execute();
				}
			}, 2000);
		}

		@Override
		protected String doInBackground(Void... voids) {
			try {
				URL url = new URL("http://" + controlIP + ":" + controlPort + "/status");
				HttpURLConnection urlConnection = (HttpURLConnection) url.openConnection();
				return IOUtils.toString(urlConnection.getInputStream());


			} catch (MalformedURLException e) {
				Log.wtf("vmcloud", e);
			} catch (IOException e) {
				Log.wtf("vmcloud", e);
			}
			return "{}";
		}
	}

	private void initMonitor() {
		controlIP = ((EditText) findViewById(R.id.controlip)).getText().toString();
		controlPort = ((EditText) findViewById(R.id.controlport)).getText().toString();
		setContentView(R.layout.monitor);
		monitorTable = (TableLayout) findViewById(R.id.monitor_table);
		new FetchServerTask().execute();
	}

	private void playAudioFrom(String ip) {
		if (player.isPlaying()) {
			player.stop();
			player.release();
		}
		try {
			player = new MediaPlayer();
			player.setDataSource("http://" + ip + ":8000/stream.mp3");
			player.prepare();
			player.start();
		} catch (IOException e) {
			Log.wtf("vmcloud", e);
		}
	}
}
