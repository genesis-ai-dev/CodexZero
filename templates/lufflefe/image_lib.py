import time
import requests
import base64
from PIL import Image, ImageDraw
import io
from typing import List, Optional, Union


class ImageGenerator:
    def __init__(self, api_key: str = "04a82c31-6fc1-4ab6-b698-d5605e352a17"):
        self.api_key = api_key
        self.base_url = "https://api.bfl.ai/v1"
    
    def generate(self, prompt: str, safety_tolerance: int = 6) -> str:
        return self._request_image(prompt, safety_tolerance=safety_tolerance)
    
    def edit(self, prompt: str, image_path: str, safety_tolerance: int = 6) -> str:
        with open(image_path, 'rb') as f:
            image_data = base64.b64encode(f.read()).decode('utf-8')
        return self._request_image(prompt, image_data, safety_tolerance)
    
    def combine_images(self, image_paths: List[str], output_path: Optional[str] = None) -> str:
        if len(image_paths) > 6:
            raise ValueError("Maximum 6 images supported")
        
        images = [Image.open(path) for path in image_paths]
        
        max_width = max(img.width for img in images)
        max_height = max(img.height for img in images)
        
        resized_images = [
            img.resize((max_width, max_height), Image.Resampling.LANCZOS) 
            for img in images
        ]
        
        grid_width = max_width * 3
        grid_height = max_height * 2
        grid = Image.new('RGB', (grid_width, grid_height), 'white')
        
        positions = [
            (0, 0), (max_width, 0), (max_width * 2, 0),
            (0, max_height), (max_width, max_height), (max_width * 2, max_height)
        ]
        
        for i, img in enumerate(resized_images):
            if i < 6:
                grid.paste(img, positions[i])
        
        output_path = output_path or f"combined_{int(time.time())}.jpg"
        
        grid.save(output_path, 'JPEG', quality=95)
        return output_path
    
    def download_image(self, url: str, filename: Optional[str] = None) -> str:
        response = requests.get(url)
        filename = filename or f"image_{int(time.time())}.jpg"
        
        with open(filename, 'wb') as f:
            f.write(response.content)
        return filename
    
    def _request_image(self, prompt: str, input_image: Optional[str] = None, safety_tolerance: int = 6) -> str:
        payload = {'prompt': prompt, 'safety_tolerance': safety_tolerance}
        
        if input_image:
            payload['input_image'] = input_image
        response = requests.post(
            f'{self.base_url}/flux-kontext-pro',
            headers={
                'accept': 'application/json',
                'x-key': self.api_key,
                'Content-Type': 'application/json'
            },
            json=payload,
            timeout=30
        )
        if response.status_code != 200:
            error_msg = response.json().get('error', 'Unknown API error')
            raise Exception(f"API request failed ({response.status_code}): {error_msg}")
        request_id = response.json()['id']
        
        while True:
            result = requests.get(
                f'{self.base_url}/get_result',
                params={'id': request_id},
                headers={'x-key': self.api_key},
                timeout=30
            ).json()
            
            if result['status'] == 'Ready':
                return result['result']['sample']
            time.sleep(2)